import { XlsxFile } from '../src/shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../src/shared/xlsx/xlsx.utils.js';

/**
 * Source of the static review import template served from GCS
 * (`internal/reviews-import-template.xlsx`). The API no longer builds it.
 * After changing columns, headers or import rules, edit this file and re-upload:
 * `npm run template:reviews-import`. `review-sheet.service.spec.ts` checks that
 * the template passes the import parser.
 */
export const REVIEWS_IMPORT_TEMPLATE_FILENAME = 'reviews-import-template.xlsx';

const TEXT = {
  sheet: 'Отзывы',
  hintsSheet: 'Подсказки',
  rating: 'Оценка',
  date: 'Дата',
  text: 'Текст',
  author: 'Автор',
  staff: 'Сотрудник',
  source: 'Источник',
  reply: 'Ответ',
  id: 'ID',
  hintColumn: 'Колонка',
  hintRequired: 'Обязательна',
  hintRule: 'Как заполнять',
  yes: 'Да',
  no: 'Нет',
  ratingHint: 'Целое число от 1 до 5',
  dateHint:
    'Дата отзыва по времени филиала: 05.03.2025, 05.03.2025 14:30 или 2025-03-05. Без времени ставится 12:00. Не раньше 2000 года и не в будущем',
  textHint: 'Текст отзыва, до 2000 символов',
  authorHint:
    'Имя и фамилия клиента, до 100 символов на каждую часть. Можно оставить пустым. Вместо одной колонки можно сделать две: «Имя» и «Фамилия»',
  staffHint:
    'Имя сотрудника, как в системе. Несколько сотрудников — через запятую. Ненайденные имена пропускаются, отзыв остаётся у филиала',
  sourceHint:
    'Откуда отзыв, например YCLIENTS. Видят только менеджеры, до 100 символов',
  replyHint: 'Ответ на отзыв, до 2000 символов',
  idHint:
    'ID отзыва в прежней системе, до 128 символов. Повторная загрузка с тем же ID не создаёт дубликат',
  exampleText: 'Всё понравилось, мастер очень внимательная. Приду ещё!',
  exampleAuthor: 'Анна Козлова',
  exampleStaff: 'Мария Иванова',
  exampleSource: 'YCLIENTS',
  exampleReply: 'Спасибо, ждём вас снова!',
};

/** Headers the import recognizes, one example row and a sheet of filling hints. */
export function buildReviewsImportTemplate(): XlsxFile {
  const columns = [
    { header: TEXT.rating, required: true, hint: TEXT.ratingHint },
    { header: TEXT.date, required: true, hint: TEXT.dateHint },
    { header: TEXT.text, required: true, hint: TEXT.textHint, width: 60 },
    { header: TEXT.author, required: false, hint: TEXT.authorHint },
    { header: TEXT.staff, required: false, hint: TEXT.staffHint },
    { header: TEXT.source, required: false, hint: TEXT.sourceHint },
    { header: TEXT.reply, required: false, hint: TEXT.replyHint },
    { header: TEXT.id, required: false, hint: TEXT.idHint },
  ];

  return XlsxUtils.write(REVIEWS_IMPORT_TEMPLATE_FILENAME, (book) => {
    const sheet = book.addSheet(TEXT.sheet);
    sheet.setColumns(
      columns.map((column, index) => ({
        header: column.header,
        key: String(index),
        width: column.width,
      })),
    );
    sheet.addRow([
      5,
      '05.03.2025 14:30',
      TEXT.exampleText,
      TEXT.exampleAuthor,
      TEXT.exampleStaff,
      TEXT.exampleSource,
      TEXT.exampleReply,
      '',
    ]);

    const hints = book.addSheet(TEXT.hintsSheet);
    hints.setColumns([
      { header: TEXT.hintColumn, key: 'column' },
      { header: TEXT.hintRequired, key: 'required', width: 14 },
      { header: TEXT.hintRule, key: 'rule', width: 100 },
    ]);
    for (const column of columns)
      hints.addRow({
        column: column.header,
        required: column.required ? TEXT.yes : TEXT.no,
        rule: column.hint,
      });
  });
}
