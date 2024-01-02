import { ReactNode } from 'react';

export interface ExpiredResult {
  upToDate?: false;
  expired: true;
  downloadUrl: string;
}

export interface UpTodateResult {
  expired?: false;
  upToDate: true;
  paused?: 'app' | 'package';
}

export interface UpdateAvailableResult {
  expired?: false;
  upToDate?: false;
  update: true;
  name: string; // version name
  hash: string;
  description: string;
  metaInfo: string;
  pdiffUrl: string;
  diffUrl?: string;
  updateUrl?: string;
}

export type CheckResult =
  | ExpiredResult
  | UpTodateResult
  | UpdateAvailableResult
  | {};

export interface ProgressData {
  hash: string;
  received: number;
  total: number;
}

export type EventType =
  | 'rollback'
  | 'errorChecking'
  | 'checking'
  | 'downloading'
  | 'errorUpdate'
  | 'markSuccess'
  | 'downloadingApk'
  | 'rejectStoragePermission'
  | 'errorStoragePermission'
  | 'errowDownloadAndInstallApk';

export interface EventData {
  currentVersion: string;
  cInfo: {
    cresc: string;
    rn: string;
    os: string;
    uuid: string;
  };
  packageVersion: string;
  buildTime: number;
  message?: string;
  rolledBackVersion?: string;
  newVersion?: string;
  [key: string]: any;
}
export type UpdateEventsLogger = ({
  type,
  data,
}: {
  type: EventType;
  data: EventData;
}) => void;

export interface CrescServerConfig {
  main: string;
  backups?: string[];
  queryUrl?: string;
}
export interface CrescOptions {
  appKey: string;
  server?: CrescServerConfig;
  logger?: UpdateEventsLogger;
  renderNewUpdatePrompt?: (data: any) => ReactNode;
  renderRollbackPrompt?: () => ReactNode;
  renderConfirmUpdatePrompt?: (data: any) => ReactNode;
  strategy?: 'onAppStart' | 'onAppResume' | 'both';
  onDownloadProgress?: (data: ProgressData) => void;
}
