export function logger(...args: any[]) {
  console.log('cresc: ', ...args);
}

export function assertRelease() {
  if (__DEV__) {
    throw new Error('@cresc/core can only run in RELEASE mode.');
  }
}
