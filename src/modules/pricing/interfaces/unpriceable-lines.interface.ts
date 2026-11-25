import { HttpStatus } from '@nestjs/common';
import { ErrorCodeEntry } from '../../../shared/interfaces/error-code-entry.interface.js';

/** Why service lines cannot be priced: the error assertPriceable throws. */
export interface UnpriceableLines {
  code: ErrorCodeEntry;
  status: HttpStatus;
}
