export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  LABOR_CONTRACT: 'Трудовой договор',
  CIVIL_CONTRACT: 'ГПХ',
  SELF_EMPLOYED: 'Самозанятый',
  INDIVIDUAL_ENTREPRENEUR: 'ИП',
};

export const PAYOUT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Наличные',
  CARD: 'Карта',
  BANK_TRANSFER: 'Расчётный счёт',
};

export const EARNING_TYPE_LABEL: Record<string, string> = {
  SERVICE_COMMISSION: 'Комиссия с услуги',
  PRODUCT_COMMISSION: 'Комиссия с товара',
  HOURLY: 'Почасовая оплата',
  FIXED_SALARY: 'Оклад',
  BONUS: 'Бонус',
  DEDUCTION: 'Удержание',
  CORRECTION: 'Корректировка',
};

export const PAYROLL_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Черновик',
  CALCULATED: 'Рассчитан',
  APPROVED: 'Утверждён',
  PAID: 'Выплачен',
};

export function labelOf(map: Record<string, string>, value: string | null | undefined): string {
  if (!value) return '';
  return map[value] ?? value;
}

export function safeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, ' ').trim() || 'staff';
  return cleaned.slice(0, 31);
}
