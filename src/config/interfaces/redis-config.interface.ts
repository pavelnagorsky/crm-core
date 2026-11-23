export interface IRedisConfig {
  /** Missing outside production: the application then runs without Redis. */
  url?: string;
}
