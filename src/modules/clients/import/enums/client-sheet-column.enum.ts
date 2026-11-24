export enum ClientSheetColumn {
  FIRST_NAME = 'firstName',
  LAST_NAME = 'lastName',
  PHONE = 'phone',
  EMAIL = 'email',
  BIRTH_DATE = 'birthDate',
  GENDER = 'gender',
  NOTES = 'notes',
  DISCOUNT_PERCENT = 'discountPercent',
}

export const CLIENT_SHEET_COLUMNS: readonly ClientSheetColumn[] = [
  ClientSheetColumn.FIRST_NAME,
  ClientSheetColumn.LAST_NAME,
  ClientSheetColumn.PHONE,
  ClientSheetColumn.EMAIL,
  ClientSheetColumn.BIRTH_DATE,
  ClientSheetColumn.GENDER,
  ClientSheetColumn.NOTES,
  ClientSheetColumn.DISCOUNT_PERCENT,
];
