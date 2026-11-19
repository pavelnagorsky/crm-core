import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';
import { NotificationAudience } from '../enums/notification-audience.enum.js';

export abstract class AbstractNotification {
  abstract readonly strategy: DeliveryStrategy;
  abstract readonly audience: NotificationAudience;
}
