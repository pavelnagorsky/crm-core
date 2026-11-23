import { AppRole } from '../shared/enums/app-role.enum.js';
import { appRole, runsCrons } from './app-role.config.js';

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

describe('runsCrons', () => {
  it('runs crons only in worker and all', () => {
    expect(runsCrons(AppRole.ALL)).toBe(true);
    expect(runsCrons(AppRole.WORKER)).toBe(true);
    expect(runsCrons(AppRole.API)).toBe(false);
  });
});
