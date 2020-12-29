import {
  tryBackupEndpoints,
  getCheckUrl,
  setCustomEndpoints,
} from './endpoint';
import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  PermissionsAndroid,
} from 'react-native';
export { setCustomEndpoints };
const {
  version: v,
} = require('react-native/Libraries/Core/ReactNativeVersion');
const RNVersion = `${v.major}.${v.minor}.${v.patch}`;

const Cresc = NativeModules.Cresc;

if (!Cresc) {
  throw new Error(
    'Can not load @cresc/core module. Please check the setup document on https://cresc.dev',
  );
}

export const downloadRootDir = Cresc.downloadRootDir;
export const packageVersion = Cresc.packageVersion;
export const currentVersion = Cresc.currentVersion;
export const isFirstTime = Cresc.isFirstTime;
const rolledbackVersion = Cresc.rolledbackVersion;
export const isRolledBack = typeof rolledbackVersion === 'string';
export const buildTime = Cresc.buildTime;
let blockUpdate = Cresc.blockUpdate;
let uuid = Cresc.uuid;

if (Platform.OS === 'android' && !Cresc.isUsingBundleUrl) {
  throw new Error(
    'Can not load @cresc/core module. Please check the setup document on https://cresc.dev',
  );
}

function setLocalHashInfo(hash, info) {
  Cresc.setLocalHashInfo(hash, JSON.stringify(info));
}

async function getLocalHashInfo(hash) {
  return JSON.parse(await Cresc.getLocalHashInfo(hash));
}

export async function getCurrentVersionInfo() {
  return currentVersion ? (await getLocalHashInfo(currentVersion)) || {} : {};
}

const eventEmitter = new NativeEventEmitter(Cresc);

if (!uuid) {
  uuid = require('nanoid/non-secure').nanoid();
  Cresc.setUuid(uuid);
}

function logger(text) {
  console.log(`Cresc: ${text}`);
}

function report(hash, type) {
  logger(type);
  fetch(getReportUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      hash,
      type,
      cInfo,
      packageVersion,
      buildTime,
    }),
  });
}

logger('uuid: ' + uuid);

export const cInfo = {
  cresc: require('../package.json').version,
  rn: RNVersion,
  os: Platform.OS + ' ' + Platform.Version,
  uuid,
};

if (isRolledBack) {
  report(rolledBackVersion, 'rollback');
}

function assertRelease() {
  if (__DEV__) {
    throw new Error('@cresc/core can only run on RELEASE version.');
  }
}

let checkingThrottling = false;
export async function checkUpdate(APPKEY, isRetry) {
  assertRelease();
  if (checkingThrottling) {
    logger('repeated checking, ignored');
    return;
  }
  checkingThrottling = true;
  setTimeout(() => {
    checkingThrottling = false;
  }, 3000);
  if (blockUpdate && blockUpdate.until > Date.now() / 1000) {
    throw new Error(
      `Cresc update service is paused because: ${
        blockUpdate.reason
      }. Please retry after ${new Date(
        blockUpdate.until * 1000,
      ).toLocaleString()}.`,
    );
  }
  if (typeof APPKEY !== 'string') {
    throw new Error(
      'APPKEY not found. Please make sure you have generated a update.json using @cresc/cli',
    );
  }
  logger('checking update');
  let resp;
  try {
    resp = await fetch(getCheckUrl(APPKEY), {
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
    });
  } catch (e) {
    if (isRetry) {
      throw new Error('Could not connect to cresc server');
    }
    await tryBackupEndpoints(APPKEY);
    return checkUpdate(APPKEY, true);
  }
  const result = await resp.json();
  checkOperation(result.op);

  if (resp.status !== 200) {
    throw new Error(result.message);
  }

  return result;
}

function checkOperation(op) {
  if (!Array.isArray(op)) {
    return;
  }
  op.forEach((action) => {
    if (action.type === 'block') {
      blockUpdate = {
        reason: action.reason,
        until: Math.round((Date.now() + action.duration) / 1000),
      };
      Cresc.setBlockUpdate(blockUpdate);
    }
  });
}

let downloadingThrottling = false;
let downloadedHash;
export async function downloadUpdate(options, eventListeners) {
  assertRelease();
  if (!options.update) {
    return;
  }
  if (rolledbackVersion === options.hash) {
    logger(`rolledback hash ${rolledbackVersion}, ignored`);
    return;
  }
  if (downloadedHash === options.hash) {
    logger(`duplicated downloaded hash ${downloadedHash}, ignored`);
    return;
  }
  if (readyHash) {
    logger(`hash ${readyHash} applied. reboot first`);
    return;
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
  if (options.diffUrl) {
    logger('downloading diff');
    try {
      await Cresc.downloadPatchFromPpk({
        updateUrl: options.diffUrl,
        hash: options.hash,
        originHash: currentVersion,
      });
    } catch (e) {
      logger(`diff error: ${e.message}, try pdiff`);
      try {
        await Cresc.downloadPatchFromPackage({
          updateUrl: options.pdiffUrl,
          hash: options.hash,
        });
      } catch (e) {
        progressHandler && progressHandler.remove();
        report(options.hash, 'error');
        return;
      }
    }
  } else if (options.pdiffUrl) {
    logger('downloading pdiff');
    try {
      await Cresc.downloadPatchFromPackage({
        updateUrl: options.pdiffUrl,
        hash: options.hash,
      });
    } catch (e) {
      progressHandler && progressHandler.remove();
      report(options.hash, 'error');
      return;
    }
  }
  setLocalHashInfo(options.hash, {
    name: options.name,
    description: options.description,
    metaInfo: options.metaInfo,
  });
  progressHandler && progressHandler.remove();
  downloadedHash = options.hash;
  return options.hash;
}

let readyHash;
function assertHash(hash) {
  if (!downloadedHash) {
    logger(`no downloaded hash`);
    return;
  }
  if (hash !== downloadedHash) {
    logger(`use downloaded hash ${downloadedHash} first`);
    return;
  }
  if (readyHash === hash) {
    logger(`hash ${readyHash} already applied. reboot first.`);
    return;
  }
  readyHash = hash;
}

export function switchVersion(hash) {
  assertRelease();
  assertHash(hash);
  logger('switchVersion: ' + hash);
  Cresc.reloadUpdate({ hash });
}

export function switchVersionLater(hash) {
  assertRelease();
  assertHash(hash);
  logger('switchVersionLater: ' + hash);
  Cresc.setNeedUpdate({ hash });
}

let marked = false;
export function markSuccess() {
  assertRelease();
  if (marked) {
    logger('repeated markSuccess, ignored');
    return;
  }
  marked = true;
  Cresc.markSuccess();
  report(currentVersion, 'success');
}

export async function downloadAndInstallApk({ url, onDownloadProgress }) {
  logger('downloadAndInstallApk');
  if (Platform.OS === 'android' && Platform.Version <= 23) {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        return;
      }
    } catch (err) {
      console.warn(err);
    }
  }
  let hash = Date.now().toString();
  let progressHandler;
  if (onDownloadProgress) {
    progressHandler = eventEmitter.addListener(
      'RCTCrescDownloadProgress',
      (progressData) => {
        if (progressData.hash === hash) {
          onDownloadProgress(progressData);
        }
      },
    );
  }
  await Cresc.downloadAndInstallApk({
    url,
    target: 'update.apk',
    hash,
  });
  progressHandler && progressHandler.remove();
}
