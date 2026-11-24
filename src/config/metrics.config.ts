const DEFAULT_PORT = 9464;
const DEFAULT_HOST = '127.0.0.1';
const MAX_PORT = 65535;

/**
 * `METRICS_PORT`, the port of the internal `/metrics` server, 9464 when missing; `0` disables the server.
 * A value that is not a port fails startup instead of silently falling back.
 */
export function metricsPort(env: NodeJS.ProcessEnv = process.env): number {
  const value = env['METRICS_PORT']?.trim();
  if (!value) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > MAX_PORT)
    throw new Error(
      `METRICS_PORT must be an integer from 0 to ${MAX_PORT}, got "${env['METRICS_PORT']}"`,
    );
  return port;
}

/**
 * `METRICS_HOST`, the interface the `/metrics` server listens on. Loopback by default, so a local run never exposes
 * it; containers set `0.0.0.0` to let Prometheus reach it over the compose network (the port is never published).
 */
export function metricsHost(env: NodeJS.ProcessEnv = process.env): string {
  return env['METRICS_HOST']?.trim() || DEFAULT_HOST;
}
