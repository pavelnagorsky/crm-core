import { InstructionsNextAction } from './instructions-next-action.interface.js';
import { NoneNextAction } from './none-next-action.interface.js';
import { RedirectNextAction } from './redirect-next-action.interface.js';

export type PaymentNextAction =
  InstructionsNextAction | RedirectNextAction | NoneNextAction;
