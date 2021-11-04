import React, { Component } from 'react';
import { Platform, Alert, Linking, AppState } from 'react-native';

import {
  isFirstTime,
  isRolledBack,
  checkUpdate,
  downloadUpdate,
  switchVersion,
  switchVersionLater,
  markSuccess,
  downloadAndInstallApk,
} from './main';

import _updateConfig from '../../../../update.json';
const { appKey } = _updateConfig[Platform.OS];

export function simpleUpdate(WrappedComponent) {
  return __DEV__
    ? WrappedComponent
    : class AppUpdate extends Component {
        componentDidMount() {
          if (isRolledBack) {
            Alert.alert('Update failed', 'The update has been reverted.');
          } else if (isFirstTime) {
            markSuccess();
          }
          this.stateListener = AppState.addEventListener(
            'change',
            (nextAppState) => {
              if (nextAppState === 'active') {
                this.checkUpdate();
              }
            },
          );
          this.checkUpdate();
        }
        componentWillUnmount() {
          this.stateListener.remove();
        }
        doUpdate = async (info) => {
          try {
            const hash = await downloadUpdate(info);
            if (!hash) {
              return;
            }
            this.stateListener.remove();
            Alert.alert(
              'Download Complete',
              'The new version is ready, restart now?',
              [
                {
                  text: 'Later',
                  style: 'cancel',
                  onPress: () => {
                    switchVersionLater(hash);
                  },
                },
                {
                  text: 'Restart',
                  style: 'default',
                  onPress: () => {
                    switchVersion(hash);
                  },
                },
              ],
            );
          } catch (err) {
            Alert.alert('Update failed', err.message);
          }
        };

        checkUpdate = async () => {
          let info;
          try {
            info = await checkUpdate(appKey);
          } catch (err) {
            Alert.alert('Checking update failed', err.message);
            return;
          }
          if (info.expired) {
            Alert.alert('New Version', 'Your app needs to be updated', [
              {
                text: 'Ok',
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
              'New Version',
              'There is a new version ' + info.name + '\n' + info.description,
              [
                { text: 'Not now', style: 'cancel' },
                {
                  text: 'Download',
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
          return <WrappedComponent {...this.props} />;
        }
      };
}
