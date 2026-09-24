export interface DocumentMessages {
  common: {
    business: string;
    period: string;
    status: string;
    currency: string;
    staff: string;
    roleTitle: string;
    taxId: string;
    employeeNumber: string;
    employmentType: string;
    payoutMethod: string;
    payout: string;
    date: string;
    type: string;
    description: string;
    base: string;
    ratePercent: string;
    rate: string;
    quantity: string;
    amount: string;
    reason: string;
    total: string;
    id: string;
    name: string;
    email: string;
    phone: string;
    createdAt: string;
  };
  payroll: {
    vedomostSheet: string;
    vedomostTitle: string;
    payslipsSheet: string;
    payslipTitle: string;
    empty: string;
    employeeNumberShort: string;
    fixedSalary: string;
    hours: string;
    services: string;
    products: string;
    bonuses: string;
    deductions: string;
    corrections: string;
    toPay: string;
    totalToPay: string;
    fallbackSheet: string;
  };
  staff: {
    sheet: string;
  };
}
