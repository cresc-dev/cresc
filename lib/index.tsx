import React, { ComponentType, PureComponent } from 'react';
import { CheckResult, CrescOptions, ProgressData, UpdateAvailableResult } from './type';
import { assertRelease, log } from './utils';
import {
  Alert,
  AppState,
  Linking,
  NativeEventSubscription,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {
  CrescModule,
  buildTime,
  cInfo,
  crescNativeEventEmitter,
  currentVersion,
  isFirstTime,
  packageVersion,
  report,
  rolledBackVersion,
  setLocalHashInfo,
} from './main';

const defaultServer = {
  main: 'https://api.cresc.dev',
  backups: ['https://api.cresc.app'],
  queryUrl:
    'https://raw.githubusercontent.com/cresc-dev/cresc/main/endpoints.json',
};

const empty = {};

export class Cresc {
  options: CrescOptions = {
    appKey: '',
    server: defaultServer,
  };

  lastChecking: number;
  lastResult: CheckResult;

  downloadingThrottling = false;
  downloadedHash: string;

  marked = false;
  applyingUpdate = false;

  constructor(options: CrescOptions) {
    if (!options.appKey) {
      throw new Error('appKey is required for withUpdates()');
    }
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        this.options[key] = value;
      }
    }
  }
  getCheckUrl = (endpoint: string = this.options.server!.main) => {
    return `${endpoint}/checkUpdate/${this.options.appKey}`;
  };
  // get telemetryUrl() {
  //   return `${this.options.server!.main}/report`;
  // }
  assertHash = (hash: string) => {
    if (!this.downloadedHash) {
      log(`no downloaded hash`);
      return;
    }
    if (hash !== this.downloadedHash) {
      log(`use downloaded hash ${this.downloadedHash} first`);
      return;
    }
    return true;
  };
  markSuccess = () => {
    assertRelease();
    if (this.marked) {
      log('repeated markSuccess, ignored');
      return;
    }
    this.marked = true;
    CrescModule.markSuccess();
    report({ type: 'markSuccess' });
  };
  switchVersion = (hash: string) => {
    assertRelease();
    if (this.assertHash(hash) && !this.applyingUpdate) {
      log('switchVersion: ' + hash);
      this.applyingUpdate = true;
      CrescModule.reloadUpdate({ hash });
    }
  };

  switchVersionLater = (hash: string) => {
    assertRelease();
    if (this.assertHash(hash)) {
      log('switchVersionLater: ' + hash);
      CrescModule.setNeedUpdate({ hash });
    }
  };
  checkUpdate = async () => {
    assertRelease();
    const now = Date.now();
    if (
      this.lastResult &&
      this.lastChecking &&
      now - this.lastChecking < 1000 * 5
    ) {
      // log('repeated checking, ignored');
      return this.lastResult;
    }
    this.lastChecking = now;
    report({ type: 'checking' });
    const fetchPayload = {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        packageVersion,
        hash: currentVersion,
        buildTime,
        cInfo,
      }),
    };
    let resp;
    try {
      resp = await fetch(this.getCheckUrl(), fetchPayload);
    } catch (e) {
      report({
        type: 'errorChecking',
        message: 'Can not connect to update server. Trying backup endpoints.',
      });
      const backupEndpoints = await this.getBackupEndpoints();
      if (backupEndpoints) {
        try {
          resp = await Promise.race(
            backupEndpoints.map((endpoint) =>
              fetch(this.getCheckUrl(endpoint), fetchPayload),
            ),
          );
        } catch {}
      }
    }
    if (!resp) {
      report({
        type: 'errorChecking',
        message: 'Can not connect to update server. Please check your network.',
      });
      return this.lastResult || empty;
    }
    const result: CheckResult = await resp.json();

    this.lastResult = result;

    if (resp.status !== 200) {
      report({
        type: 'errorChecking',
        //@ts-ignore
        message: result.message,
      });
    }

    return result;
  };
  withUpdates = (WrappedComponent: ComponentType) => {
    const cresc = this;
    const { strategy } = this.options;
    return __DEV__
      ? WrappedComponent
      : class CrescRoot extends PureComponent {
          stateListener: NativeEventSubscription;
          componentDidMount() {
            if (isFirstTime) {
              cresc.markSuccess();
            }
            if (strategy === 'both' || strategy === 'onAppResume') {
              this.stateListener = AppState.addEventListener(
                'change',
                (nextAppState) => {
                  if (nextAppState === 'active') {
                    this.checkUpdate();
                  }
                },
              );
            }
            if (strategy === 'both' || strategy === 'onAppStart') {
              this.checkUpdate();
            }
          }
          componentWillUnmount() {
            this.stateListener && this.stateListener.remove();
          }
          doUpdate = async (info: UpdateAvailableResult) => {
            try {
              const hash = await cresc.downloadUpdate(info);
              if (!hash) {
                return;
              }
              this.stateListener && this.stateListener.remove();

              Alert.alert(
                'Download complete',
                'Do you want to apply the update now?',
                [
                  {
                    text: 'Later',
                    style: 'cancel',
                    onPress: () => {
                      cresc.switchVersionLater(hash);
                    },
                  },
                  {
                    text: 'Now',
                    style: 'default',
                    onPress: () => {
                      cresc.switchVersion(hash);
                    },
                  },
                ],
              );
            } catch (err) {
              Alert.alert('Update failed', err.message);
            }
          };

          checkUpdate = async () => {
            let info: CheckResult;
            try {
              info = await cresc.checkUpdate();
            } catch (err) {
              Alert.alert('Update failed', err.message);
              return;
            }
            if ('expired' in info) {
              const { downloadUrl } = info;
              Alert.alert(
                'Major update',
                'A full update is required to continue using the app',
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      if (downloadUrl) {
                        if (
                          Platform.OS === 'android' &&
                          downloadUrl.endsWith('.apk')
                        ) {
                          cresc.downloadAndInstallApk(downloadUrl);
                        } else {
                          Linking.openURL(downloadUrl);
                        }
                      }
                    },
                  },
                ],
              );
            } else if ('update' in info) {
              Alert.alert(
                `Version ${info.name} available`,
                `What's new\n
                ${info.description}
                `,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'OK',
                    style: 'default',
                    onPress: () => {
                      this.doUpdate(info as UpdateAvailableResult);
                    },
                  },
                ],
              );
            }
          };

          render() {
            return <WrappedComponent {...this.props} />;
          }
        };
  };
  getBackupEndpoints = async () => {
    const { server } = this.options;
    if (!server) {
      return [];
    }
    if (server.queryUrl) {
      try {
        const resp = await fetch(server.queryUrl);
        const remoteEndpoints = await resp.json();
        log('fetch endpoints:', remoteEndpoints);
        if (Array.isArray(remoteEndpoints)) {
          server.backups = Array.from(
            new Set([...(server.backups || []), ...remoteEndpoints]),
          );
        }
      } catch (e) {
        log('failed to fetch endpoints from: ', server.queryUrl);
      }
    }
    return server.backups;
  };
  downloadUpdate = async (
    info: CheckResult,
    onDownloadProgress?: (data: ProgressData) => void,
  ) => {
    assertRelease();
    if (!('update' in info)) {
      return;
    }
    if (rolledBackVersion === info.hash) {
      log(`rolledback hash ${rolledBackVersion}, ignored`);
      return;
    }
    if (this.downloadedHash === info.hash) {
      log(`duplicated downloaded hash ${this.downloadedHash}, ignored`);
      return this.downloadedHash;
    }
    if (this.downloadingThrottling) {
      log('repeated downloading, ignored');
      return;
    }
    this.downloadingThrottling = true;
    setTimeout(() => {
      this.downloadingThrottling = false;
    }, 3000);
    let progressHandler;
    if (onDownloadProgress) {
      progressHandler = crescNativeEventEmitter.addListener(
        'RCTCrescDownloadProgress',
        (progressData) => {
          if (progressData.hash === info.hash) {
            onDownloadProgress(progressData);
          }
        },
      );
    }
    let succeeded = false;
    report({ type: 'downloading' });
    if (info.diffUrl) {
      log('downloading diff');
      try {
        await CrescModule.downloadPatchFromPpk({
          updateUrl: info.diffUrl,
          hash: info.hash,
          originHash: currentVersion,
        });
        succeeded = true;
      } catch (e) {
        log(`diff error: ${e.message}, try pdiff`);
      }
    }
    if (!succeeded && info.pdiffUrl) {
      log('downloading pdiff');
      try {
        await CrescModule.downloadPatchFromPackage({
          updateUrl: info.pdiffUrl,
          hash: info.hash,
        });
        succeeded = true;
      } catch (e) {
        log(`pdiff error: ${e.message}, try full patch`);
      }
    }
    if (!succeeded && info.updateUrl) {
      log('downloading full patch');
      try {
        await CrescModule.downloadFullUpdate({
          updateUrl: info.updateUrl,
          hash: info.hash,
        });
        succeeded = true;
      } catch (e) {
        log(`full patch error: ${e.message}`);
      }
    }
    progressHandler && progressHandler.remove();
    if (!succeeded) {
      return report({
        type: 'errorUpdate',
        data: { newVersion: info.hash },
      });
    }
    setLocalHashInfo(info.hash, {
      name: info.name,
      description: info.description,
      metaInfo: info.metaInfo,
    });
    this.downloadedHash = info.hash;
    return info.hash;
  };
  downloadAndInstallApk = async (
    url: string,
    onDownloadProgress?: (data: ProgressData) => void,
  ) => {
    if (Platform.OS !== 'android') {
      return;
    }
    report({ type: 'downloadingApk' });
    if (Platform.Version <= 23) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          return report({ type: 'rejectStoragePermission' });
        }
      } catch (err) {
        return report({ type: 'errorStoragePermission' });
      }
    }
    let hash = Date.now().toString();
    let progressHandler;
    if (onDownloadProgress) {
      progressHandler = crescNativeEventEmitter.addListener(
        'RCTCrescDownloadProgress',
        (progressData: ProgressData) => {
          if (progressData.hash === hash) {
            onDownloadProgress(progressData);
          }
        },
      );
    }
    await CrescModule.downloadAndInstallApk({
      url,
      target: 'update.apk',
      hash,
    }).catch(() => {
      report({ type: 'errowDownloadAndInstallApk' });
    });
    progressHandler && progressHandler.remove();
  };
}
