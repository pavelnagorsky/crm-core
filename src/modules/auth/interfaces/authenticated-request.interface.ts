import { TokenPayloadDto } from '../dto/token-payload.dto.js';

export interface AuthenticatedRequest {
  user?: TokenPayloadDto;
  params: Record<string, string | undefined>;
}
