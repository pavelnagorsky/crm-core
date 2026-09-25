import { PassThrough } from 'stream';

export interface XlsxFile {
  stream: PassThrough;
  filename: string;
}
