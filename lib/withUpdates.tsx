import React, { PureComponent, ComponentType } from 'react';
import {
  Platform,
  Alert,
  Linking,
  AppState,
  NativeEventSubscription,
} from 'react-native';

import {
  isFirstTime,
  isRolledBack,
  checkUpdate,
  downloadUpdate,
  switchVersion,
  switchVersionLater,
  markSuccess,
  downloadAndInstallApk,
  onCrescEvents,
} from './main';
import { CrescOptions } from './type';

export function withUpdates(
  WrappedComponent: ComponentType,
  {
    appKey,
    onEvents: eventListeners,
    renderRollbackPrompt,
    renderConfirmUpdatePrompt,
    renderNewUpdatePrompt,
    strategy,
  }: CrescOptions,
) {
  if (!appKey) {
    throw new Error('appKey is required for withUpdates()');
  }
  if (typeof eventListeners === 'function') {
    onCrescEvents(eventListeners);
  }
  return __DEV__
    ? WrappedComponent
    : class CrescRoot extends PureComponent {
        stateListener: NativeEventSubscription;
        componentDidMount() {
          if (isRolledBack && !renderRollbackPrompt) {
            Alert.alert(
              'Sorry',
              'The update has been rolled back due to an error',
            );
          } else if (isFirstTime) {
            markSuccess();
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
        doUpdate = async (info) => {
          try {
            const hash = await downloadUpdate(info);
            if (!hash) {
              return;
            }
            this.stateListener && this.stateListener.remove();
            Alert.alert('提示', '下载完毕，是否立即更新?', [
              {
                text: '以后再说',
                style: 'cancel',
                onPress: () => {
                  switchVersionLater(hash);
                },
              },
              {
                text: '立即更新',
                style: 'default',
                onPress: () => {
                  switchVersion(hash);
                },
              },
            ]);
          } catch (err) {
            Alert.alert('更新失败', err.message);
          }
        };

        checkUpdate = async () => {
          let info;
          try {
            info = await checkUpdate(appKey!);
          } catch (err) {
            Alert.alert('更新检查失败', err.message);
            return;
          }
          if (info.expired) {
            Alert.alert('提示', '您的应用版本已更新，点击确定下载安装新版本', [
              {
                text: '确定',
                onPress: () => {
                  if (info.downloadUrl) {
                    if (
                      Platform.OS === 'android' &&
                      info.downloadUrl.endsWith('.apk')
                    ) {
                      downloadAndInstallApk({
                        url: info.downloadUrl,
                      });
                    } else {
                      Linking.openURL(info.downloadUrl);
                    }
                  }
                },
              },
            ]);
          } else if (info.update) {
            Alert.alert(
              '提示',
              '检查到新的版本' + info.name + ',是否下载?\n' + info.description,
              [
                { text: '否', style: 'cancel' },
                {
                  style: 'default',
                  onPress: () => {
                    this.doUpdate(info);
                  },
                },
              ],
            );
          }
        };

        render() {
          return (
            <>
              <WrappedComponent {...this.props} />;
              {isRolledBack && renderRollbackPrompt && renderRollbackPrompt()}
            </>
          );
        }
      };
}
