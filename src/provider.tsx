import React, {
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  NativeEventSubscription,
  AppState,
  Platform,
  Linking,
} from 'react-native';
import { Cresc } from './client';
import {
  currentVersion,
  isFirstTime,
  packageVersion,
  getCurrentVersionInfo,
} from './core';
import { CheckResult, ProgressData } from './type';
import { CrescContext } from './context';

export const CrescProvider = ({
  client,
  children,
}: {
  client: Cresc;
  children: ReactNode;
}) => {
  const { options } = client;
  const stateListener = useRef<NativeEventSubscription>();
  const [updateInfo, setUpdateInfo] = useState<CheckResult>();
  const updateInfoRef = useRef(updateInfo);
  const [progress, setProgress] = useState<ProgressData>();
  const [lastError, setLastError] = useState<Error>();
  const lastChecking = useRef<number>();

  const dismissError = useCallback(() => {
    setLastError(undefined);
  }, []);

  const showAlert = useCallback(
    (...args: Parameters<typeof Alert.alert>) => {
      if (options.useAlert) {
        Alert.alert(...args);
      }
    },
    [options],
  );

  const switchVersion = useCallback(() => {
    if (updateInfo && updateInfo.hash) {
      client.switchVersion(updateInfo.hash);
    }
  }, [client, updateInfo]);

  const switchVersionLater = useCallback(() => {
    if (updateInfo && updateInfo.hash) {
      client.switchVersionLater(updateInfo.hash);
    }
  }, [client, updateInfo]);

  const downloadUpdate = useCallback(
    async (info: CheckResult | undefined = updateInfoRef.current) => {
      if (!info || !info.update) {
        return;
      }
      try {
        const hash = await client.downloadUpdate(info, setProgress);
        if (!hash) {
          return;
        }
        stateListener.current && stateListener.current.remove();
        showAlert('Download complete', 'Do you want to apply the update now?', [
          {
            text: 'Later',
            style: 'cancel',
            onPress: () => {
              client.switchVersionLater(hash);
            },
          },
          {
            text: 'Now',
            style: 'default',
            onPress: () => {
              client.switchVersion(hash);
            },
          },
        ]);
      } catch (err: any) {
        setLastError(err);
        showAlert('Failed to update', err.message);
      }
    },
    [client, showAlert],
  );

  const downloadAndInstallApk = useCallback(
    async (downloadUrl: string) => {
      if (Platform.OS === 'android' && downloadUrl) {
        await client.downloadAndInstallApk(downloadUrl, setProgress);
      }
    },
    [client],
  );

  const checkUpdate = useCallback(async () => {
    const now = Date.now();
    if (lastChecking.current && now - lastChecking.current < 1000) {
      return;
    }
    lastChecking.current = now;
    let info: CheckResult;
    try {
      info = await client.checkUpdate();
    } catch (err: any) {
      setLastError(err);
      showAlert('Failed to check update', err.message);
      return;
    }
    setUpdateInfo(info);
    if (info.expired) {
      const { downloadUrl } = info;
      showAlert(
        'Major update',
        'A full update is required to download and install to continue.',
        [
          {
            text: 'OK',
            onPress: () => {
              if (downloadUrl) {
                if (Platform.OS === 'android' && downloadUrl.endsWith('.apk')) {
                  downloadAndInstallApk(downloadUrl);
                } else {
                  Linking.openURL(downloadUrl);
                }
              }
            },
          },
        ],
      );
    } else if (info.update) {
      showAlert(
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
              downloadUpdate();
            },
          },
        ],
      );
    }
  }, [client, downloadAndInstallApk, downloadUpdate, showAlert]);

  const markSuccess = client.markSuccess;

  useEffect(() => {
    if (__DEV__) {
      console.info('DEV env detected, skipping update check.');
      return;
    }
    const { strategy, dismissErrorAfter, autoMarkSuccess } = options;
    if (isFirstTime && autoMarkSuccess) {
      markSuccess();
    }
    if (strategy === 'both' || strategy === 'onAppResume') {
      stateListener.current = AppState.addEventListener(
        'change',
        nextAppState => {
          if (nextAppState === 'active') {
            checkUpdate();
          }
        },
      );
    }
    if (strategy === 'both' || strategy === 'onAppStart') {
      checkUpdate();
    }
    let dismissErrorTimer: ReturnType<typeof setTimeout>;
    if (typeof dismissErrorAfter === 'number' && dismissErrorAfter > 0) {
      dismissErrorTimer = setTimeout(() => {
        dismissError();
      }, dismissErrorAfter);
    }
    return () => {
      stateListener.current && stateListener.current.remove();
      clearTimeout(dismissErrorTimer);
    };
  }, [checkUpdate, options, dismissError, markSuccess]);

  return (
    <CrescContext.Provider
      value={{
        checkUpdate,
        switchVersion,
        switchVersionLater,
        dismissError,
        updateInfo,
        lastError,
        markSuccess,
        client,
        downloadUpdate,
        packageVersion,
        currentHash: currentVersion,
        progress,
        downloadAndInstallApk,
        getCurrentVersionInfo,
      }}>
      {children}
    </CrescContext.Provider>
  );
};
