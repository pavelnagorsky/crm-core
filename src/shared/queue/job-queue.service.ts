import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';

const POOL_SIZE = 3;
const START_ATTEMPTS = 3;
const RESTART_DELAY_MS = 30_000;
/** Leaves room within `docker stop --time 30` for the rest of the shutdown. */
const STOP_TIMEOUT_MS = 10_000;

type ReadyListener = (boss: PgBoss) => Promise<void>;

/**
 * The pg-boss instance: jobs live in the `pgboss` schema of the application database.
 * A failed start does not stop the application: the queue keeps trying in the background and
 * reports `ready = false` meanwhile.
 */
@Injectable()
export class JobQueueService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(JobQueueService.name);
  readonly boss: PgBoss;
  private readonly listeners: ReadyListener[] = [];
  private isReady = false;
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(config: ConfigService) {
    this.boss = new PgBoss({
      connectionString: config.get<string>('database.url'),
      application_name: 'klendo-core-jobs',
      max: POOL_SIZE,
      // Recurring work stays on @nestjs/schedule.
      schedule: false,
    });
    // An 'error' event without a listener would crash the process.
    this.boss.on('error', (error) =>
      this.logger.error(`Job queue error: ${error.message}`, error.stack),
    );
    this.boss.on('warning', (warning) =>
      this.logger.warn(`Job queue warning: ${warning.message}`),
    );
  }

  get ready(): boolean {
    return this.isReady;
  }

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  /** Runs `listener` once the queue is up: now if it already is. */
  async onReady(listener: ReadyListener): Promise<void> {
    this.listeners.push(listener);
    if (this.isReady) await this.notify(listener);
  }

  /** After the HTTP server closed: requests still running could queue jobs until then. */
  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (!this.isReady) return;
    this.isReady = false;
    await this.boss.stop({ graceful: true, timeout: STOP_TIMEOUT_MS });
  }

  private async start(): Promise<void> {
    try {
      await this.boss.start({ attempts: START_ATTEMPTS });
    } catch (error) {
      this.logger.error(
        `Job queue unavailable, retrying in ${RESTART_DELAY_MS / 1000}s: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (!this.stopping)
        this.restartTimer = setTimeout(
          () => void this.start(),
          RESTART_DELAY_MS,
        );
      return;
    }
    this.isReady = true;
    this.logger.log('Job queue started');
    for (const listener of this.listeners) await this.notify(listener);
  }

  private async notify(listener: ReadyListener): Promise<void> {
    try {
      await listener(this.boss);
    } catch (error) {
      this.logger.error(
        'Job queue setup failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
