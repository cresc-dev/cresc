import { ComponentType } from 'react';
import { CheckResult, CrescOptions, ProgressData, UpdateAvailableResult, UpdateEventsListener } from './type';
import { withUpdates } from './withUpdates';
import { assertRelease, logger } from './utils';
import { PermissionsAndroid, Platform } from 'react-native';
import { CrescModule, report } from './main';

export const defaultServer = {
  main: 'https://api.cresc.dev',
  backups: ['https://api.cresc.app'],
  queryUrl:
    'https://raw.githubusercontent.com/cresc-dev/cresc/main/endpoints.json',
};

let lastChecking;
const empty = {};
let lastResult: CheckResult;

function checkOperation(
  op: { type: string; reason: string; duration: number }[],
) {
  if (!Array.isArray(op)) {
    return;
  }
  op.forEach((action) => {
    if (action.type === 'block') {
      blockUpdate = {
        reason: action.reason,
        until: Math.round((Date.now() + action.duration) / 1000),
      };
      CrescModule.setBlockUpdate(blockUpdate);
    }
  });
}

let downloadingThrottling = false;
let downloadedHash: string;
export async function downloadUpdate(
  options: UpdateAvailableResult,
  eventListeners?: {
    onDownloadProgress?: (data: ProgressData) => void;
  },
) {
  assertRelease();
  if (!options.update) {
    return;
  }
  if (rolledBackVersion === options.hash) {
    logger(`rolledback hash ${rolledBackVersion}, ignored`);
    return;
  }
  if (downloadedHash === options.hash) {
    logger(`duplicated downloaded hash ${downloadedHash}, ignored`);
    return downloadedHash;
  }
  if (downloadingThrottling) {
    logger('repeated downloading, ignored');
    return;
  }
  downloadingThrottling = true;
  setTimeout(() => {
    downloadingThrottling = false;
  }, 3000);
  let progressHandler;
  if (eventListeners) {
    if (eventListeners.onDownloadProgress) {
      const downloadCallback = eventListeners.onDownloadProgress;
      progressHandler = eventEmitter.addListener(
        'RCTCrescDownloadProgress',
        (progressData) => {
          if (progressData.hash === options.hash) {
            downloadCallback(progressData);
          }
        },
      );
    }
  }
  let succeeded = false;
  report({ type: 'downloading' });
  if (options.diffUrl) {
    logger('downloading diff');
    try {
      await CrescModule.downloadPatchFromPpk({
        updateUrl: options.diffUrl,
        hash: options.hash,
        originHash: currentVersion,
      });
      succeeded = true;
    } catch (e) {
      logger(`diff error: ${e.message}, try pdiff`);
    }
  }
  if (!succeeded && options.pdiffUrl) {
    logger('downloading pdiff');
    try {
      await CrescModule.downloadPatchFromPackage({
        updateUrl: options.pdiffUrl,
        hash: options.hash,
      });
      succeeded = true;
    } catch (e) {
      logger(`pdiff error: ${e.message}, try full patch`);
    }
  }
  if (!succeeded && options.updateUrl) {
    logger('downloading full patch');
    try {
      await CrescModule.downloadFullUpdate({
        updateUrl: options.updateUrl,
        hash: options.hash,
      });
      succeeded = true;
    } catch (e) {
      logger(`full patch error: ${e.message}`);
    }
  }
  progressHandler && progressHandler.remove();
  if (!succeeded) {
    return report({ type: 'errorUpdate', data: { newVersion: options.hash } });
  }
  setLocalHashInfo(options.hash, {
    name: options.name,
    description: options.description,
    metaInfo: options.metaInfo,
  });
  downloadedHash = options.hash;
  return options.hash;
}

function assertHash(hash: string) {
  if (!downloadedHash) {
    logger(`no downloaded hash`);
    return;
  }
  if (hash !== downloadedHash) {
    logger(`use downloaded hash ${downloadedHash} first`);
    return;
  }
  return true;
}

let applyingUpdate = false;
export function switchVersion(hash: string) {
  assertRelease();
  if (assertHash(hash) && !applyingUpdate) {
    logger('switchVersion: ' + hash);
    applyingUpdate = true;
    CrescModule.reloadUpdate({ hash });
  }
}

export function switchVersionLater(hash: string) {
  assertRelease();
  if (assertHash(hash)) {
    logger('switchVersionLater: ' + hash);
    CrescModule.setNeedUpdate({ hash });
  }
}

let marked = false;
export function markSuccess() {
  assertRelease();
  if (marked) {
    logger('repeated markSuccess, ignored');
    return;
  }
  marked = true;
  CrescModule.markSuccess();
  report({ type: 'markSuccess' });
}

export async function downloadAndInstallApk({
  url,
  onDownloadProgress,
}: {
  url: string;
  onDownloadProgress?: (data: ProgressData) => void;
}) {
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
    progressHandler = eventEmitter.addListener(
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
}

export class Cresc {
  options: CrescOptions = {
    appKey: '',
    server: defaultServer,
  };
  constructor(options: CrescOptions) {
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        this.options[key] = value;
      }
    }
  }
  getCheckUrl(endpoint: string = this.options.server!.main) {
    return `${endpoint}/checkUpdate/${this.options.appKey}`;
  }
  // get telemetryUrl() {
  //   return `${this.options.server!.main}/report`;
  // }
  async checkUpdate() {
    assertRelease();
    const now = Date.now();
    if (lastResult && lastChecking && now - lastChecking < 1000 * 60) {
      // logger('repeated checking, ignored');
      return lastResult;
    }
    lastChecking = now;
    if (blockUpdate && blockUpdate.until > Date.now() / 1000) {
      report({
        type: 'errorChecking',
        message: `Cresc update service is paused because: ${
          blockUpdate.reason
        }. Please retry after ${new Date(
          blockUpdate.until * 1000,
        ).toLocaleString()}.`,
      });
      return lastResult || empty;
    }
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
      return lastResult || empty;
    }
    const result: CheckResult = await resp.json();

    lastResult = result;
    // @ts-ignore
    checkOperation(result.op);

    if (resp.status !== 200) {
      report({
        type: 'errorChecking',
        //@ts-ignore
        message: result.message,
      });
    }

    return result;
  }
  withUpdates(component: ComponentType) {
    return withUpdates(component, this.options);
  }
  async getBackupEndpoints() {
    if (!this.options.server) {
      return [];
    }
    const { backups = [], queryUrl } = this.options.server;
    if (queryUrl) {
      try {
        const resp = await fetch(queryUrl);
        const remoteEndpoints = await resp.json();
        logger('fetch endpoints:', remoteEndpoints);
        if (Array.isArray(remoteEndpoints)) {
          this.options.server.backups = Array.from(
            new Set([...backups, ...remoteEndpoints]),
          );
        }
      } catch (e) {
        logger('failed to fetch endpoints from: ', queryUrl);
      }
    }
    return this.options.server.backups;
  }
}
