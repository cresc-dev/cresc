import { Fragment } from 'react';

const noop = () => {};
export class Cresc {
  constructor() {
    console.warn('@cresc/core is not supported and will do nothing on web.');
    return new Proxy(this, {
      get() {
        return noop;
      },
    });
  }
}

export { CrescContext, useCresc } from './context';

export const CrescProvider = Fragment;
