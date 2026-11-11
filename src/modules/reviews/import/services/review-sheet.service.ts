import { Injectable } from '@nestjs/common';
import regularExpressions from '../../../../shared/regular-expressions.js';
import { XlsxCells } from '../../../../shared/xlsx/interfaces/xlsx-cells.interface.js';
import { XlsxRow } from '../../../../shared/xlsx/interfaces/xlsx-row.interface.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import {
  REVIEW_AUTHOR_NAME_MAX_LENGTH,
  REVIEW_REPLY_MAX_LENGTH,
  REVIEW_TEXT_MAX_LENGTH,
} from '../../constants/reviews.constants.js';
import { sanitizeReviewText } from '../../rules/review-text.rules.js';
import {
  REVIEW_IMPORT_ID_MAX_LENGTH,
  REVIEW_IMPORT_MAX_BYTES,
  REVIEW_IMPORT_MAX_ROWS,
  REVIEW_IMPORT_SOURCE_MAX_LENGTH,
} from '../constants/review-import.constants.js';
import { ReviewImportFileReason } from '../enums/review-import-file-reason.enum.js';
import { ReviewImportRowError } from '../enums/review-import-row-error.enum.js';
import {
  REVIEW_SHEET_COLUMNS,
  ReviewSheetColumn,
} from '../enums/review-sheet-column.enum.js';
import { ReviewImportUpload } from '../interfaces/review-import-upload.interface.js';
import { ReviewSheetRow } from '../interfaces/review-sheet-row.interface.js';
import { ReviewSheetScan } from '../interfaces/review-sheet-scan.interface.js';
import { parseImportDate } from '../rules/review-import-date.rules.js';
import { reviewImportKey } from '../rules/review-import-key.rules.js';
import { parseImportRating } from '../rules/review-import-rating.rules.js';

type SheetColumns = Partial<Record<ReviewSheetColumn, number>>;
type ScannedSheet = Extract<ReviewSheetScan, { ok: true }>;

const REQUIRED_COLUMNS: readonly ReviewSheetColumn[] = [
  ReviewSheetColumn.RATING,
  ReviewSheetColumn.DATE,
  ReviewSheetColumn.TEXT,
];

const HEADER_ALIASES: Record<ReviewSheetColumn, readonly string[]> = {
  [ReviewSheetColumn.RATING]: [
    'оценка',
    'рейтинг',
    'звезды',
    'rating',
    'stars',
  ],
  [ReviewSheetColumn.DATE]: ['дата', 'дата отзыва', 'date', 'review date'],
  [ReviewSheetColumn.TEXT]: [
    'текст',
    'текст отзыва',
    'отзыв',
    'комментарий',
    'text',
    'review',
    'comment',
  ],
  [ReviewSheetColumn.AUTHOR]: ['автор', 'клиент', 'author', 'client'],
  [ReviewSheetColumn.FIRST_NAME]: ['имя', 'first name', 'firstname'],
  [ReviewSheetColumn.LAST_NAME]: ['фамилия', 'last name', 'lastname'],
  [ReviewSheetColumn.STAFF]: [
    'сотрудник',
    'сотрудники',
    'мастер',
    'мастера',
    'staff',
  ],
  [ReviewSheetColumn.SOURCE]: ['источник', 'source'],
  [ReviewSheetColumn.REPLY]: ['ответ', 'ответ на отзыв', 'reply'],
  [ReviewSheetColumn.ID]: ['id', 'ид', 'id отзыва', 'review id'],
};

/** Reads the review sheet in two streaming passes, so only one row is held in memory. */
@Injectable()
export class ReviewSheetService {
  /** First pass: file checks, header and row count. Nothing is parsed beyond that. */
  async scan(file: ReviewImportUpload | undefined): Promise<ReviewSheetScan> {
    const fileReason = this.fileReason(file);
    if (fileReason || !file)
      return {
        ok: false,
        reason: fileReason ?? ReviewImportFileReason.MISSING,
      };

    let header: { row: number; columns: SheetColumns } | null = null;
    let totalRows = 0;
    try {
      for await (const row of XlsxUtils.rows(file.buffer)) {
        if (!header) {
          header = { row: row.number, columns: this.mapHeaderColumns(row) };
          const missingColumns = REQUIRED_COLUMNS.filter(
            (key) => header?.columns[key] == null,
          );
          if (missingColumns.length > 0)
            return {
              ok: false,
              reason: ReviewImportFileReason.MISSING_COLUMNS,
              missingColumns,
            };
          continue;
        }
        if (this.isEmpty(row, header.columns)) continue;
        totalRows += 1;
        if (totalRows > REVIEW_IMPORT_MAX_ROWS)
          return { ok: false, reason: ReviewImportFileReason.TOO_MANY_ROWS };
      }
    } catch {
      return { ok: false, reason: ReviewImportFileReason.CORRUPT };
    }

    if (!header)
      return {
        ok: false,
        reason: ReviewImportFileReason.MISSING_COLUMNS,
        missingColumns: [...REQUIRED_COLUMNS],
      };
    if (totalRows === 0)
      return { ok: false, reason: ReviewImportFileReason.EMPTY };
    return {
      ok: true,
      file,
      headerRow: header.row,
      columns: header.columns,
      totalRows,
    };
  }

  /** Second pass over a scanned file: one parsed row at a time, empty rows skipped. */
  async *rows(
    sheet: ScannedSheet,
    timezone: string,
    now: Date,
  ): AsyncGenerator<ReviewSheetRow> {
    for await (const row of XlsxUtils.rows(sheet.file.buffer)) {
      if (row.number <= sheet.headerRow || this.isEmpty(row, sheet.columns))
        continue;
      yield this.parseRow(row, sheet.columns, timezone, now);
    }
  }

  private parseRow(
    row: XlsxRow,
    columns: SheetColumns,
    timezone: string,
    now: Date,
  ): ReviewSheetRow {
    const fail = (error: ReviewImportRowError): ReviewSheetRow => ({
      number: row.number,
      ok: false,
      error,
    });
    const value = (key: ReviewSheetColumn) => {
      const column = columns[key];
      return column == null ? null : row.value(column);
    };
    const text = (key: ReviewSheetColumn) => {
      const column = columns[key];
      return column == null ? '' : this.plainText(row.text(column));
    };

    const rating = parseImportRating(value(ReviewSheetColumn.RATING));
    if (rating == null) return fail(ReviewImportRowError.RATING_INVALID);

    const date = parseImportDate(value(ReviewSheetColumn.DATE), timezone, now);
    if (!date) return fail(ReviewImportRowError.DATE_INVALID);

    const reviewText = text(ReviewSheetColumn.TEXT);
    if (!reviewText) return fail(ReviewImportRowError.TEXT_REQUIRED);
    if (reviewText.length > REVIEW_TEXT_MAX_LENGTH)
      return fail(ReviewImportRowError.TEXT_TOO_LONG);

    const [firstName, lastName] = this.authorName(text, columns);
    if (
      firstName.length > REVIEW_AUTHOR_NAME_MAX_LENGTH ||
      lastName.length > REVIEW_AUTHOR_NAME_MAX_LENGTH
    )
      return fail(ReviewImportRowError.AUTHOR_TOO_LONG);

    const source = text(ReviewSheetColumn.SOURCE);
    if (source.length > REVIEW_IMPORT_SOURCE_MAX_LENGTH)
      return fail(ReviewImportRowError.SOURCE_TOO_LONG);

    const reply = text(ReviewSheetColumn.REPLY);
    if (reply.length > REVIEW_REPLY_MAX_LENGTH)
      return fail(ReviewImportRowError.REPLY_TOO_LONG);

    const id = text(ReviewSheetColumn.ID);
    if (id.length > REVIEW_IMPORT_ID_MAX_LENGTH)
      return fail(ReviewImportRowError.ID_TOO_LONG);

    return {
      number: row.number,
      ok: true,
      record: {
        importKey: reviewImportKey({
          id: id || null,
          author: `${firstName} ${lastName}`,
          dateKey: date.key,
          rating,
          text: reviewText,
        }),
        rating,
        text: reviewText,
        authorFirstName: firstName || null,
        authorLastName: lastName || null,
        reviewedAt: date.at,
        source: source || null,
        replyText: reply || null,
        staffNames: this.staffNames(text(ReviewSheetColumn.STAFF)),
      },
    };
  }

  /** One author column is split at the first space; a separate last-name column is taken as is. */
  private authorName(
    text: (key: ReviewSheetColumn) => string,
    columns: SheetColumns,
  ): [string, string] {
    const author = text(ReviewSheetColumn.AUTHOR);
    if (!author && columns[ReviewSheetColumn.LAST_NAME] != null)
      return [
        text(ReviewSheetColumn.FIRST_NAME),
        text(ReviewSheetColumn.LAST_NAME),
      ];
    const [first = '', ...rest] = (
      author || text(ReviewSheetColumn.FIRST_NAME)
    ).split(regularExpressions.whitespace);
    return [first, rest.join(' ')];
  }

  private staffNames(cell: string): string[] {
    return [
      ...new Set(
        cell
          .split(regularExpressions.staffNameSeparators)
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    ];
  }

  private plainText(value: string): string {
    return sanitizeReviewText(value) as string;
  }

  private fileReason(
    file: ReviewImportUpload | undefined,
  ): ReviewImportFileReason | null {
    if (!file || file.size === 0) return ReviewImportFileReason.MISSING;
    if (file.size > REVIEW_IMPORT_MAX_BYTES)
      return ReviewImportFileReason.TOO_LARGE;
    if (!XlsxUtils.isXlsx(file)) return ReviewImportFileReason.UNSUPPORTED_TYPE;
    return null;
  }

  private isEmpty(row: XlsxCells, columns: SheetColumns): boolean {
    return REVIEW_SHEET_COLUMNS.every((key) => {
      const column = columns[key];
      return column == null || row.text(column) === '';
    });
  }

  private mapHeaderColumns(headerRow: XlsxCells): SheetColumns {
    const aliases = new Map<string, ReviewSheetColumn>();
    for (const key of REVIEW_SHEET_COLUMNS) {
      for (const alias of HEADER_ALIASES[key])
        aliases.set(this.normalizeHeader(alias), key);
    }

    const columns: SheetColumns = {};
    headerRow.each((text, column) => {
      const key = aliases.get(this.normalizeHeader(text));
      if (key && columns[key] == null) columns[key] = column;
    });
    return columns;
  }

  private normalizeHeader(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(new RegExp(regularExpressions.whitespace, 'g'), ' ');
  }
}
