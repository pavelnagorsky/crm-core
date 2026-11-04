import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { gunzipSync } from 'node:zlib';
import pino from 'pino';
import readableLogTransport from './readable-log.transport.js';

describe('Readable rotating logs', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'crm-logs-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes readable correlated logs and error stacks, and appends after a restart', async () => {
    const transport = readableLogTransport({ directory, stdout: false });
    const logger = pino({}, transport).child({
      context: 'BookingService',
      requestId: 'booking-request',
    });
    logger.info('Booking created: bookingId=123');
    logger.warn('Slot unavailable');
    logger.error({ err: new Error('database unavailable') }, 'Booking failed');
    const complete = finished(transport);
    transport.end();
    await complete;

    const app = await readFile(join(directory, 'app.log'), 'utf8');
    const errors = await readFile(join(directory, 'errors.log'), 'utf8');
    expect(app).toContain(
      '[BookingService] requestId=booking-request Booking created: bookingId=123',
    );
    expect(app).toContain('UTC');
    expect(errors).toContain('Booking failed');
    expect(errors).toContain('database unavailable');
    expect(errors).toContain('at ');
    expect(errors).not.toContain('Slot unavailable');
    expect(app).not.toContain('\u001b');

    const restarted = readableLogTransport({ directory, stdout: false });
    pino({}, restarted).info('application restarted');
    const closed = finished(restarted);
    restarted.end();
    await closed;
    const appended = await readFile(join(directory, 'app.log'), 'utf8');
    expect(appended).toContain('Booking created');
    expect(appended).toContain('application restarted');
  });

  it('rotates by size, compresses archives and removes archives past the limit', async () => {
    const transport = readableLogTransport({
      directory,
      stdout: false,
      rotationSize: '1K',
      maxFiles: 2,
    });
    const logger = pino({}, transport);
    for (let i = 0; i < 20; i++) logger.info(`entry-${i} ${'x'.repeat(200)}`);
    const complete = finished(transport);
    transport.end();
    await complete;
    const archives = await readdir(join(directory, 'archive'));
    expect(archives).toHaveLength(2);
    for (const file of archives) {
      expect(file).toMatch(/\.gz$/);
      expect(
        gunzipSync(await readFile(join(directory, 'archive', file))).toString(),
      ).toContain('INFO');
    }
  }, 15000);
});
