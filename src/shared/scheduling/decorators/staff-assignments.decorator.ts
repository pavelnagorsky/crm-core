import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  JsonObjectArray,
  JSON_OBJECT_ARRAY_MAX_LENGTH,
} from '../../transforms/json-object-array.transform.js';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { MULTI_SERVICE_MAX_ITEMS } from '../constants/multi-service.constants.js';
import { StaffAssignmentDto } from '../dto/staff-assignment.dto.js';

export function StaffAssignments(query = false): PropertyDecorator {
  return applyDecorators(
    ApiProperty(
      query
        ? {
            type: String,
            required: false,
            maxLength: JSON_OBJECT_ARRAY_MAX_LENGTH,
            description:
              'JSON array of { serviceId: UUID, staffId?: UUID | null }, maximum 10 unique services. Omitted, [] or null staffId means automatic assignment. URL-encode the JSON string.',
          }
        : {
            type: () => StaffAssignmentDto,
            isArray: true,
            required: false,
            maxItems: MULTI_SERVICE_MAX_ITEMS,
          },
    ),
    IsOptional(),
    IsArray(),
    ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS),
    ArrayUnique((item: StaffAssignmentDto) => item?.serviceId),
    ValidateNested({ each: true }),
    query
      ? JsonObjectArray(StaffAssignmentDto, MULTI_SERVICE_MAX_ITEMS)
      : Type(() => StaffAssignmentDto),
  );
}
