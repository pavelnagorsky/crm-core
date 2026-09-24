import { Injectable } from '@nestjs/common';
import { ExportColumn, ExportResult, ExportService } from '../../shared/export/export.service.js';
import { StaffService, StaffWithAvatar } from './staff.service.js';
import { StaffExportRequestDto } from './dto/staff-export-request.dto.js';

type StaffRow = {
  id: string;
  name: string;
  roleTitle: string;
  email: string;
  phone: string;
  status: string;
  createdAt: Date;
};

const STAFF_COLUMNS: ExportColumn<StaffRow>[] = [
  { header: 'ID', key: 'id' },
  { header: 'Name', key: 'name' },
  { header: 'Role Title', key: 'roleTitle' },
  { header: 'Email', key: 'email' },
  { header: 'Phone', key: 'phone' },
  { header: 'Status', key: 'status' },
  { header: 'Created At', key: 'createdAt' },
];

@Injectable()
export class StaffExportService {
  constructor(private readonly staffService: StaffService) {}

  async stream(businessId: string, dto: StaffExportRequestDto): Promise<ExportResult> {
    const { items } = await this.staffService.search(businessId, { ...dto, isExport: true });
    return ExportService.build(items.map(toRow), STAFF_COLUMNS, 'staff');
  }
}

function toRow(s: StaffWithAvatar): StaffRow {
  return {
    id: s.id,
    name: s.name,
    roleTitle: s.roleTitle ?? '',
    email: s.email ?? '',
    phone: s.phone ?? '',
    status: s.status,
    createdAt: s.createdAt,
  };
}
