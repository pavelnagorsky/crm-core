import { BookingPalette } from '@prisma/client';

export interface BookingFormColumns {
  palette: BookingPalette;
  customBackground: string | null;
  customSurface: string | null;
  customText: string | null;
  customMuted: string | null;
  customAccent: string | null;
  customAccentText: string | null;
  headline: string;
  caption: string;
  buttonLabel: string;
  showStaff: boolean;
  showServiceImages: boolean;
  showBranding: boolean;
}
