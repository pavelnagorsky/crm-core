/** What `RedisService` last logged about its connection, so only changes are logged. */
export enum RedisConnectionState {
  CONNECTING = 'connecting',
  UP = 'up',
  DOWN = 'down',
}
