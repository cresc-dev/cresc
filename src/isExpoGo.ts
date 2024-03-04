import { Platform } from 'react-native';

export function isExpoGo() {
  try {
    return (
      // @ts-expect-error - This depends on unstable Expo implementation details
      typeof expo === 'object' &&
      // @ts-expect-error - This depends on unstable Expo implementation details
      expo.modules?.ExponentConstants?.executionEnvironment === 'storeClient'
    );
  } catch {
    return false;
  }
}

export class CrescInExpoGoError extends Error {
  constructor() {
    const runCommand = `npx expo run:${Platform.OS}`;
    super(
      `'cresc' was imported from the Expo Go app, but unfortunately Expo Go doesn't contain the native module for the 'cresc' package - consider using an Expo development build instead:\n\nnpm install expo-dev-client\n${runCommand}\n\nRead more: https://docs.expo.dev/develop/development-builds/introduction/`,
    );
  }
}

if (isExpoGo()) {
  throw new CrescInExpoGoError();
}
