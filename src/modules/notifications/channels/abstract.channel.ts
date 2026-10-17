import { AbstractNotification } from '../messages/abstract.notification.js';

export abstract class AbstractChannel {
  abstract readonly name: string;
  abstract canHandle(notification: AbstractNotification): boolean;
  abstract send(notification: AbstractNotification): Promise<void>;
}
