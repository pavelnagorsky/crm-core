export interface VkTokensResponse {
  access_token: string;
  refresh_token: string;
  user_id: number;
  state: string;
  error?: string;
  error_description?: string;
}
