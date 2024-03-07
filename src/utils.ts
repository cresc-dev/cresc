export function log(...args: any[]) {
  console.log('cresc: ', ...args);
}

export function assertRelease() {
  if (__DEV__) {
    throw new Error('@cresc/core can only run in RELEASE mode.');
  }
}

const ping = async (url: string) =>
  Promise.race([
    fetch(url, {
      method: 'HEAD',
    }).then(({ status }) => status === 200),
    new Promise<false>(r => setTimeout(() => r(false), 2000)),
  ]);

export const testUrls = async (urls?: string[]) => {
  if (!urls?.length) {
    return null;
  }
  return Promise.race(urls.map(url => ping(url).then(() => url))).catch(
    () => null,
  );
};
