import React, {useState} from 'react';
import {
  StyleSheet,
  Platform,
  Text,
  View,
  TouchableOpacity,
  Image,
  Switch,
} from 'react-native';
import {Icon, PaperProvider, Snackbar, Banner} from 'react-native-paper';

import TestConsole from './TestConsole';

import _updateConfig from '../update.json';
import {CrescProvider, Cresc, useCresc} from '@cresc/core';
const {appKey} = _updateConfig[Platform.OS];

function App() {
  const {
    client,
    checkUpdate,
    downloadUpdate,
    switchVersionLater,
    switchVersion,
    updateInfo,
    packageVersion,
    currentHash,
    progress: {received, total} = {},
  } = useCresc();
  const [useDefaultAlert, setUseDefaultAlert] = useState(true);
  const [showTestConsole, setShowTestConsole] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [showUpdateSnackbar, setShowUpdateSnackbar] = useState(false);
  const snackbarVisible =
    !useDefaultAlert && showUpdateSnackbar && updateInfo?.update;

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>Cresc Demo</Text>
      <View style={{flexDirection: 'row'}}>
        <Text>
          {useDefaultAlert ? 'Use' : 'Do not use'} default alert dialog
        </Text>
        <Switch
          value={useDefaultAlert}
          onValueChange={v => {
            setUseDefaultAlert(v);
            client?.setOptions({
              useAlert: v,
            });
            setShowUpdateSnackbar(!v);
          }}
        />
      </View>
      <Image
        resizeMode={'contain'}
        source={require('./assets/shezhi.png')}
        style={styles.image}
      />
      <Text style={styles.instructions}>
        Version 1 {'\n'}
        Native package version: {packageVersion}
        {'\n'}
        Current jsbundle hash: {currentHash || '(NA)'}
        {'\n'}
      </Text>
      <Text>
        Downloading: {received} / {total}
      </Text>
      <TouchableOpacity
        onPress={() => {
          checkUpdate();
          setShowUpdateSnackbar(true);
        }}>
        <Text style={styles.instructions}>Press here to check update</Text>
      </TouchableOpacity>

      <TouchableOpacity
        testID="testcase"
        style={{marginTop: 15}}
        onLongPress={() => {
          setShowTestConsole(true);
        }}>
        <Text style={styles.instructions}>
          @cresc/core version:{client?.version}
        </Text>
      </TouchableOpacity>
      <TestConsole visible={showTestConsole} />
      {snackbarVisible && (
        <Snackbar
          visible={snackbarVisible}
          onDismiss={() => {
            setShowUpdateSnackbar(false);
          }}
          action={{
            label: 'Download Update',
            onPress: async () => {
              setShowUpdateSnackbar(false);
              await downloadUpdate();
              setShowUpdateBanner(true);
            },
          }}>
          <Text style={{color: 'white'}}>
            New version({updateInfo.name}) available, update now?
          </Text>
        </Snackbar>
      )}
      <Banner
        style={{width: '100%', position: 'absolute', top: 0}}
        visible={showUpdateBanner}
        actions={[
          {
            label: 'Apply and Restart',
            onPress: switchVersion,
          },
          {
            label: 'Next time',
            onPress: () => {
              switchVersionLater();
              setShowUpdateBanner(false);
            },
          },
        ]}
        icon={({size}) => (
          <Icon name="checkcircleo" size={size} color="#00f" />
        )}>
        Update downloaded, do you want to apply and restart now?
      </Banner>
    </View>
  );
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

const crescClient = new Cresc({
  appKey,
});

export default function Root() {
  return (
    <CrescProvider client={crescClient}>
      <PaperProvider>
        <App />
      </PaperProvider>
    </CrescProvider>
  );
}
