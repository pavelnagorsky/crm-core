import { Injectable } from '@nestjs/common';
import { Client } from '@prisma/client';
import { trafficSourceLabel } from '../../../../shared/traffic/rules/traffic-source-label.js';
import {
  DEFAULT_LANG,
  LocaleService,
} from '../../../../shared/i18n/locale.service.js';
import { DocumentMessages } from '../../../../shared/interfaces/document-messages.interface.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { XlsxColumn } from '../../../../shared/xlsx/interfaces/xlsx-column.interface.js';
import { XlsxFile } from '../../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxUtils } from '../../../../shared/xlsx/xlsx.utils.js';
import { ClientsService } from '../../services/clients.service.js';
import { ClientExportRequestDto } from '../dto/client-export-request.dto.js';

type ClientRow = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: string;
  notes: string;
  acquisitionSource: string;
  discountPercent: string;
};

@Injectable()
export class ClientsExportService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly locale: LocaleService,
  ) {}

  async stream(
    brandId: string,
    dto: ClientExportRequestDto,
    lang = DEFAULT_LANG,
  ): Promise<XlsxFile> {
    const messages = this.locale.get(lang);
    const text = messages.documents.clients;
    const columns: XlsxColumn<ClientRow>[] = [
      { header: text.firstName, key: 'firstName' },
      { header: text.lastName, key: 'lastName' },
      { header: text.phone, key: 'phone', width: 18 },
      { header: text.email, key: 'email' },
      { header: text.birthDate, key: 'birthDate' },
      { header: text.gender, key: 'gender' },
      { header: text.notes, key: 'notes', width: 40 },
      { header: text.acquisitionSource, key: 'acquisitionSource', width: 28 },
      { header: text.discountPercent, key: 'discountPercent', width: 14 },
    ];
    const { items } = await this.clientsService.search(brandId, {
      search: dto.search,
      orderBy: dto.orderBy,
      orderDirection: dto.orderDirection,
      page: 1,
      pageSize: 1,
      isExport: true,
    });
    return XlsxUtils.table(
      items.map((client) => this.toRow(client, text, messages.trafficSource)),
      columns,
      'clients',
      text.sheet,
    );
  }

  private toRow(
    client: Client,
    text: DocumentMessages['clients'],
    sources: Record<string, string>,
  ): ClientRow {
    return {
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone,
      email: client.email ?? '',
      birthDate: client.birthDate
        ? TimeUtils.dateOnlyStr(client.birthDate)
        : '',
      gender: this.genderLabel(client.gender, text),
      notes: client.notes ?? '',
      acquisitionSource: trafficSourceLabel(
        sources,
        client.acquisitionSource,
        client.acquisitionSourceDetail,
      ),
      discountPercent: client.discountPercent?.toString() ?? '',
    };
  }

  private genderLabel(
    gender: string | null,
    text: DocumentMessages['clients'],
  ): string {
    if (gender === 'MALE') return text.genderMale;
    if (gender === 'FEMALE') return text.genderFemale;
    return gender ?? '';
  }
}
