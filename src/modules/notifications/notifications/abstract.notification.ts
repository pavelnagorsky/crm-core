import { DeliveryStrategy } from '../enums/delivery-strategy.enum.js';

export abstract class AbstractNotification {
  abstract readonly strategy: DeliveryStrategy;
}
