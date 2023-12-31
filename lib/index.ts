import { checkUpdate } from './main';
import { UpdateEventsListener } from './type';


export class Cresc {
  options: CrescOptions = {
    appKey: '',
    backupEndpoints: [],
    backupQueryUrl: '',
  };
  constructor(options: CrescOptions) {
    this.options = { ...this.options, ...options };
  }
  checkUpdate() {
    return checkUpdate(this.options.appKey);
  }
  // registerUpdateComponent() {
  //   return
  // }
}
