export interface IGoogleCloudConfig {
  bucketName: string;
  /** Never public; files are served through short-lived signed URLs. */
  privateBucketName: string;
  projectId: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
}
