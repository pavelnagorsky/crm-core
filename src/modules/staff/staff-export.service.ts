import { Injectable } from '@nestjs/common';
import { XlsxColumn } from '../../shared/xlsx/interfaces/xlsx-column.interface.js';
import { XlsxFile } from '../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxService } from '../../shared/xlsx/xlsx.service.js';
import { DEFAULT_LANG, LocaleService } from '../../shared/i18n/locale.service.js';
import { labelOf } from '../../shared/i18n/label-of.js';
import { I18nLocale } from '../../shared/interfaces/i18n-locale.interface.js';
import { StaffService, StaffWithAvatar } from './staff.service.js';
import { StaffExportRequestDto } from './dto/staff-export-request.dto.js';

type StaffRow = {
  id: string;
  name: string;
  roleTitle: string;
  email: string;
  phone: string;
  status: string;
  employmentType: string;
  taxId: string;
  employeeNumber: string;
  payoutMethod: string;
  createdAt: Date;
};

@Injectable()
export class StaffExportService {
  constructor(
    private readonly staffService: StaffService,
    private readonly locale: LocaleService,
  ) {}

  async stream(businessId: string, dto: StaffExportRequestDto, lang = DEFAULT_LANG): Promise<XlsxFile> {
    const messages = this.locale.get(lang);
    const text = messages.documents;
    const columns: XlsxColumn<StaffRow>[] = [
      { header: text.common.id, key: 'id' },
      { header: text.common.name, key: 'name' },
      { header: text.common.roleTitle, key: 'roleTitle' },
      { header: text.common.email, key: 'email' },
      { header: text.common.phone, key: 'phone' },
      { header: text.common.status, key: 'status' },
      { header: text.common.employmentType, key: 'employmentType' },
      { header: text.common.taxId, key: 'taxId' },
      { header: text.common.employeeNumber, key: 'employeeNumber' },
      { header: text.common.payoutMethod, key: 'payoutMethod' },
      { header: text.common.createdAt, key: 'createdAt' },
    ];
    const { items } = await this.staffService.search(businessId, { ...dto, isExport: true });
    const rows = items.map((staff) => this.toRow(staff, messages));
    return XlsxService.table(rows, columns, 'staff', text.staff.sheet);
  }

  private toRow(staff: StaffWithAvatar, messages: I18nLocale): StaffRow {
    return {
      id: staff.id,
      name: staff.name,
      roleTitle: staff.roleTitle ?? '',
      email: staff.email ?? '',
      phone: staff.phone ?? '',
      status: labelOf(messages.staffStatus, staff.status),
      employmentType: labelOf(messages.employmentType, staff.employmentType),
      taxId: staff.taxId ?? '',
      employeeNumber: staff.employeeNumber ?? '',
      payoutMethod: labelOf(messages.payoutMethod, staff.payoutMethod),
      createdAt: staff.createdAt,
    };
  }
}
