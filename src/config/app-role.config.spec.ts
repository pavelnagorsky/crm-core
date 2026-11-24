import { AppRole } from '../shared/enums/app-role.enum.js';
import { appRole, runsBackgroundWork } from './app-role.config.js';

describe('appRole', () => {
  it('defaults to all', () => {
    expect(appRole({})).toBe(AppRole.ALL);
    expect(appRole({ APP_ROLE: ' ' })).toBe(AppRole.ALL);
  });

  it('reads the configured role', () => {
    expect(appRole({ APP_ROLE: 'api' })).toBe(AppRole.API);
    expect(appRole({ APP_ROLE: ' Worker ' })).toBe(AppRole.WORKER);
    expect(appRole({ APP_ROLE: 'all' })).toBe(AppRole.ALL);
  });

  it('rejects an unknown role', () => {
    expect(() => appRole({ APP_ROLE: 'cron' })).toThrow(
      'APP_ROLE must be one of all, api, worker, got "cron"',
    );
  });
});

describe('runsBackgroundWork', () => {
  it('runs background work only in worker and all', () => {
    expect(runsBackgroundWork(AppRole.ALL)).toBe(true);
    expect(runsBackgroundWork(AppRole.WORKER)).toBe(true);
    expect(runsBackgroundWork(AppRole.API)).toBe(false);
  });
});
