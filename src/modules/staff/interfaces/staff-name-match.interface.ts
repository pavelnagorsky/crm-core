import { Staff } from '@prisma/client';

export type StaffNameMatch = Pick<Staff, 'id' | 'name'>;
