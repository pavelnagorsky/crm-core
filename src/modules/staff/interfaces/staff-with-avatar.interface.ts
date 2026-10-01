import { File, Staff } from '@prisma/client';

export interface StaffWithAvatar extends Staff {
  avatarFile: File | null;
}
