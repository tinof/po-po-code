export { runRg, runRgCount } from './cli';
export { resolveGrepCli, resolveGrepCliWithAutoInstall } from './constants';
export {
  downloadAndInstallRipgrep,
  getInstalledRipgrepPath,
} from './downloader';
export { grep } from './tools';
export type { CountResult, GrepMatch, GrepOptions, GrepResult } from './types';
