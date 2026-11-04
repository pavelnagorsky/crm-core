import { LevelWithSilent } from 'pino';

export interface LoggingConfig {
  level: LevelWithSilent;
  directory: string;
}
