import { BookingPage, File } from '@prisma/client';

export interface BookingPageWithCover extends BookingPage {
  coverFile: File | null;
}
