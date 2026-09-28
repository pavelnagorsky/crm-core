import { Injectable } from '@nestjs/common';
import { Client } from '@prisma/client';
import { XlsxColumn } from '../../../shared/xlsx/interfaces/xlsx-column.interface.js';
import { XlsxFile } from '../../../shared/xlsx/interfaces/xlsx-file.interface.js';
import { XlsxService } from '../../../shared/xlsx/xlsx.service.js';
import { DEFAULT_LANG, LocaleService } from '../../../shared/i18n/locale.service.js';
import { DocumentMessages } from '../../../shared/interfaces/document-messages.interface.js';
import { ClientsService } from '../clients.service.js';
import { ClientExportRequestDto } from './dto/client-export-request.dto.js';

type ClientRow = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: string;
  notes: string;
};

@Injectable()
export class ClientsExportService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly locale: LocaleService,
  ) {}

  async stream(businessId: string, dto: ClientExportRequestDto, lang = DEFAULT_LANG): Promise<XlsxFile> {
    const text = this.locale.get(lang).documents.clients;
    const columns: XlsxColumn<ClientRow>[] = [
      { header: text.firstName, key: 'firstName' },
      { header: text.lastName, key: 'lastName' },
      { header: text.phone, key: 'phone', width: 18 },
      { header: text.email, key: 'email' },
      { header: text.birthDate, key: 'birthDate' },
      { header: text.gender, key: 'gender' },
      { header: text.notes, key: 'notes', width: 40 },
    ];
    const { items } = await this.clientsService.search(businessId, {
      businessId,
      search: dto.search,
      orderBy: dto.orderBy,
      orderDirection: dto.orderDirection,
      page: 1,
      pageSize: 1,
      isExport: true,
    });
    return XlsxService.table(items.map((client) => this.toRow(client, text)), columns, 'clients', text.sheet);
  }

  private toRow(client: Client, text: DocumentMessages['clients']): ClientRow {
    return {
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone,
      email: client.email ?? '',
      birthDate: client.birthDate ? client.birthDate.toISOString().slice(0, 10) : '',
      gender: this.genderLabel(client.gender, text),
      notes: client.notes ?? '',
    };
  }

  private genderLabel(gender: string | null, text: DocumentMessages['clients']): string {
    if (gender === 'MALE') return text.genderMale;
    if (gender === 'FEMALE') return text.genderFemale;
    return gender ?? '';
  }
}
