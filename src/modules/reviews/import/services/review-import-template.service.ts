import { Injectable } from '@nestjs/common';
import {
  DEFAULT_LANG,
  LocaleService,
} from '../../../../shared/i18n/locale.service.js';
import { XlsxFile } from '../../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';

const TEMPLATE_FILENAME = 'reviews-import-template.xlsx';

@Injectable()
export class ReviewImportTemplateService {
  constructor(private readonly locale: LocaleService) {}

  /** Headers the import recognizes, one example row and a sheet of filling hints. */
  build(lang = DEFAULT_LANG): XlsxFile {
    const text = this.locale.get(lang).documents.reviewsImport;
    const columns = [
      { header: text.rating, required: true, hint: text.ratingHint },
      { header: text.date, required: true, hint: text.dateHint },
      { header: text.text, required: true, hint: text.textHint, width: 60 },
      { header: text.author, required: false, hint: text.authorHint },
      { header: text.staff, required: false, hint: text.staffHint },
      { header: text.source, required: false, hint: text.sourceHint },
      { header: text.reply, required: false, hint: text.replyHint },
      { header: text.id, required: false, hint: text.idHint },
    ];

    return XlsxUtils.write(TEMPLATE_FILENAME, (book) => {
      const sheet = book.addSheet(text.sheet);
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
        text.exampleText,
        text.exampleAuthor,
        text.exampleStaff,
        text.exampleSource,
        text.exampleReply,
        '',
      ]);

      const hints = book.addSheet(text.hintsSheet);
      hints.setColumns([
        { header: text.hintColumn, key: 'column' },
        { header: text.hintRequired, key: 'required', width: 14 },
        { header: text.hintRule, key: 'rule', width: 100 },
      ]);
      for (const column of columns)
        hints.addRow({
          column: column.header,
          required: column.required ? text.yes : text.no,
          rule: column.hint,
        });
    });
  }
}
