import { PrivateFile } from '@prisma/client';
import { SignedFileUrl } from './signed-file-url.interface.js';

export interface SignedPrivateFile extends SignedFileUrl {
  file: PrivateFile;
}
