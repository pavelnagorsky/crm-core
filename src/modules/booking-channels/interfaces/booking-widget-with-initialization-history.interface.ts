import { BookingWidget, BookingWidgetInitialization } from '@prisma/client';

export interface BookingWidgetWithInitializationHistory extends BookingWidget {
  initializationHistory: BookingWidgetInitialization[];
}
