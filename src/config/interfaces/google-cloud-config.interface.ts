export interface IGoogleCloudConfig {
  bucketName: string;
  /** Never public; files are served through short-lived signed URLs. */
  privateBucketName: string;
  projectId: string;
  /** Service account key file. Default secrets/google-credentials.json; Docker Compose sets /run/secrets/google-credentials.json. */
  credentialsFile: string;
  clientId: string;
  clientSecret: string;
}
