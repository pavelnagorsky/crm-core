import { ApiProperty } from '@nestjs/swagger';
import { TrialEligibility } from '../interfaces/trial-eligibility.interface.js';

export class TrialEligibilityResponseDto {
  @ApiProperty({ description: 'A new brand of this user gets a trial' })
  eligible: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Brand where the trial was used, deleted ones included',
  })
  usedInBrandName: string | null;

  static fromEntity(value: TrialEligibility): TrialEligibilityResponseDto {
    return Object.assign(new TrialEligibilityResponseDto(), value);
  }
}
