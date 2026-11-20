export interface EmailSettings {
  clientNotificationsEnabled: boolean;
  sender: string;
  smtpHost: string;
  smtpPort: number;
  queueReady: boolean;
  maxAttempts: number;
  retryWindowMinutes: number;
  workerConcurrency: number;
  retentionDays: number;
}
