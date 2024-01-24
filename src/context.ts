import { createContext, useContext } from 'react';
import { CheckResult, ProgressData } from './type';
import { Cresc } from './client';

const empty = {};
const noop = () => {};

export const defaultContext = {
  checkUpdate: () => Promise.resolve(empty),
  switchVersion: noop,
  switchVersionLater: noop,
  markSuccess: noop,
  dismissError: noop,
  downloadUpdate: noop,
  currentHash: '',
  packageVersion: '',
};

export const CrescContext = createContext<{
  checkUpdate: () => void;
  switchVersion: () => void;
  switchVersionLater: () => void;
  markSuccess: () => void;
  dismissError: () => void;
  downloadUpdate: () => void;
  currentHash: string;
  packageVersion: string;
  client?: Cresc;
  progress?: ProgressData;
  updateInfo?: CheckResult;
  lastError?: Error;
}>(defaultContext);

export const useCresc = () => useContext(CrescContext);
