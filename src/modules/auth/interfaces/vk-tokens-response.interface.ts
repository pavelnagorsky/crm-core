export interface VkTokensResponse {
  access_token: string;
  refresh_token: string;
  user_id: number;
  error?: string;
  error_description?: string;
}
