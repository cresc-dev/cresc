import { createContext, useContext } from 'react';
import { CheckResult, ProgressData } from './type';
import { Cresc } from './client';

const noop = () => {};
const asyncNoop = () => Promise.resolve();

export const defaultContext = {
  checkUpdate: asyncNoop,
  switchVersion: noop,
  switchVersionLater: noop,
  markSuccess: noop,
  dismissError: noop,
  downloadUpdate: asyncNoop,
  downloadAndInstallApk: asyncNoop,
  getCurrentVersionInfo: () => Promise.resolve({}),
  currentHash: '',
  packageVersion: '',
};

export const CrescContext = createContext<{
  checkUpdate: () => Promise<void>;
  switchVersion: () => void;
  switchVersionLater: () => void;
  markSuccess: () => void;
  dismissError: () => void;
  downloadUpdate: () => Promise<void>;
  downloadAndInstallApk: (url: string) => Promise<void>;
  getCurrentVersionInfo: () => Promise<{
    name?: string;
    description?: string;
    metaInfo?: string;
  }>;
  currentHash: string;
  packageVersion: string;
  client?: Cresc;
  progress?: ProgressData;
  updateInfo?: CheckResult;
  lastError?: Error;
}>(defaultContext);

export const useCresc = () => useContext(CrescContext);
