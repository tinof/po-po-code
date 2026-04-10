import { describe, expect, test } from 'bun:test';
import { CACHE_DIR } from './constants';
import { getAutoUpdateInstallDir } from './index';

describe('auto-update-checker/index', () => {
  test('uses OpenCode cache dir for auto-update installs', () => {
    expect(getAutoUpdateInstallDir()).toBe(CACHE_DIR);
  });
});
