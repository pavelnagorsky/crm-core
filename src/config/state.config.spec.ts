import { StateBackend } from '../shared/enums/state-backend.enum.js';
import configuration from './configuration.js';
import { stateBackend } from './state.config.js';

describe('stateBackend', () => {
  it('uses Redis when a url is configured', () => {
    expect(stateBackend('redis://localhost:6379')).toBe(StateBackend.REDIS);
  });

  it('uses process memory without a url', () => {
    expect(stateBackend(undefined)).toBe(StateBackend.MEMORY);
  });

  describe('in configuration', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('derives state.backend from REDIS_URL', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
      expect(configuration().state).toEqual({ backend: StateBackend.REDIS });

      vi.stubEnv('REDIS_URL', '');
      expect(configuration().state).toEqual({ backend: StateBackend.MEMORY });
    });
  });
});
