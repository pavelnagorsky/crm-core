export enum ReviewSheetColumn {
  RATING = 'rating',
  DATE = 'date',
  TEXT = 'text',
  AUTHOR = 'author',
  FIRST_NAME = 'firstName',
  LAST_NAME = 'lastName',
  STAFF = 'staff',
  SOURCE = 'source',
  REPLY = 'reply',
  ID = 'id',
}

export const REVIEW_SHEET_COLUMNS: readonly ReviewSheetColumn[] = [
  ReviewSheetColumn.RATING,
  ReviewSheetColumn.DATE,
  ReviewSheetColumn.TEXT,
  ReviewSheetColumn.AUTHOR,
  ReviewSheetColumn.FIRST_NAME,
  ReviewSheetColumn.LAST_NAME,
  ReviewSheetColumn.STAFF,
  ReviewSheetColumn.SOURCE,
  ReviewSheetColumn.REPLY,
  ReviewSheetColumn.ID,
];
