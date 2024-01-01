import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { EventType, UpdateEventsListener } from './type';
import { logger } from './utils';
const {
  version: v,
} = require('react-native/Libraries/Core/ReactNativeVersion');
const RNVersion = `${v.major}.${v.minor}.${v.patch}`;
const isTurboModuleEnabled = global.__turboModuleProxy != null;

export const CrescModule = isTurboModuleEnabled
  ? require('./turboModuleSpec').default
  : NativeModules.Cresc;

if (!CrescModule) {
  throw new Error(
    'Can not load @cresc/core module. Please check the setup document.',
  );
}
const CrescConstants = isTurboModuleEnabled
  ? CrescModule.getConstants()
  : CrescModule;

export const downloadRootDir = CrescConstants.downloadRootDir;
export const packageVersion = CrescConstants.packageVersion;
export const currentVersion = CrescConstants.currentVersion;
export const isFirstTime = CrescConstants.isFirstTime;
export const rolledBackVersion = CrescConstants.rolledBackVersion;
export const isRolledBack = typeof rolledBackVersion === 'string';

export const buildTime = CrescConstants.buildTime;
let uuid = CrescConstants.uuid;

if (Platform.OS === 'android' && !CrescConstants.isUsingBundleUrl) {
  throw new Error(
    'Can not load @cresc/core module. Please check your bundle url.',
  );
}

function setLocalHashInfo(hash: string, info: Record<string, any>) {
  CrescModule.setLocalHashInfo(hash, JSON.stringify(info));
}

async function getLocalHashInfo(hash: string) {
  return JSON.parse(await CrescModule.getLocalHashInfo(hash));
}

export async function getCurrentVersionInfo(): Promise<{
  name?: string;
  description?: string;
  metaInfo?: string;
}> {
  return currentVersion ? (await getLocalHashInfo(currentVersion)) || {} : {};
}

export const crescNativeEventEmitter = new NativeEventEmitter(CrescModule);

if (!uuid) {
  uuid = require('nanoid/non-secure').nanoid();
  CrescModule.setUuid(uuid);
}

const noop = () => {};
let reporter: UpdateEventsListener = noop;

export function onCrescEvents(customReporter: UpdateEventsListener) {
  reporter = customReporter;
  if (isRolledBack) {
    report({
      type: 'rollback',
      data: {
        rolledBackVersion,
      },
    });
  }
}

export function report({
  type,
  message = '',
  data = {},
}: {
  type: EventType;
  message?: string;
  data?: Record<string, string | number>;
}) {
  logger(type + ' ' + message);
  reporter({
    type,
    data: {
      currentVersion,
      cInfo,
      packageVersion,
      buildTime,
      message,
      ...data,
    },
  });
}

logger('uuid: ' + uuid);

export const cInfo = {
  cresc: require('../package.json').version,
  rn: RNVersion,
  os: Platform.OS + ' ' + Platform.Version,
  uuid,
};
