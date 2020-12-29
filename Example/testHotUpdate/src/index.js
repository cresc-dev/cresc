import React, {Component} from 'react';
import {
  StyleSheet,
  Platform,
  Text,
  View,
  Alert,
  TouchableOpacity,
  Linking,
  Image,
} from 'react-native';

import {
  isFirstTime,
  isRolledBack,
  packageVersion,
  currentVersion,
  checkUpdate,
  downloadUpdate,
  switchVersion,
  switchVersionLater,
  markSuccess,
  downloadAndInstallApk,
  cInfo,
} from '@cresc/core';

import TestConsole from './TestConsole';

import _updateConfig from '../update.json';
const {appKey} = _updateConfig[Platform.OS];
export default class App extends Component {
  state = {
    received: 0,
    total: 0,
    showTestConsole: false,
  };
  componentDidMount() {
    if (isRolledBack) {
      Alert.alert('Update failed', 'The update has been reverted.');
    } else if (isFirstTime) {
      markSuccess();
    }
  }
  doUpdate = async info => {
    try {
      const hash = await downloadUpdate(info, {
        onDownloadProgress: ({received, total}) => {
          this.setState({
            received,
            total,
          });
        },
      });
      Alert.alert(
        'Download Complete',
        'The new version is ready, restart now?',
        [
          {
            text: 'Restart',
            onPress: () => {
              switchVersion(hash);
            },
          },
          {
            text: 'Later',
            onPress: () => {
              switchVersionLater(hash);
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
                  onDownloadProgress: ({received, total}) => {
                    this.setState({
                      received,
                      total,
                    });
                  },
                });
              } else {
                Linking.openURL(info.downloadUrl);
              }
            }
          },
        },
      ]);
    } else if (info.upToDate) {
      Alert.alert('', 'Your app is up-to-date.');
    } else {
      Alert.alert(
        '',
        'There is a new version ' + info.name + '\n' + info.description,
        [
          {
            text: 'Download',
            onPress: () => {
              this.doUpdate(info);
            },
          },
          {text: 'No'},
        ],
      );
    }
  };

  render() {
    const {received, total, showTestConsole} = this.state;
    return (
      <View style={styles.container}>
        <Text style={styles.welcome}>Cresc Update Demo</Text>
        <Image
          resizeMode={'contain'}
          source={require('./assets/shezhi.png')}
          style={styles.image}
        />
        <Text style={styles.instructions}>
          Initial Version {'\n'}
          Current package version: {packageVersion}
          {'\n'}
          Current update hash: {currentVersion || '(N/A)'}
          {'\n'}
        </Text>
        <Text>
          Progress: {received} / {total}
        </Text>
        <TouchableOpacity onPress={this.checkUpdate}>
          <Text style={styles.instructions}>Check update</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{marginTop: 15}}
          onLongPress={() => {
            this.setState({showTestConsole: true});
          }}>
          <Text style={styles.instructions}>
            @cresc/core version: {cInfo.cresc}
          </Text>
        </TouchableOpacity>
        <TestConsole visible={showTestConsole} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5FCFF',
  },
  welcome: {
    fontSize: 20,
    textAlign: 'center',
    margin: 10,
  },
  instructions: {
    textAlign: 'center',
    color: '#333333',
    marginBottom: 5,
  },
  image: {},
});
