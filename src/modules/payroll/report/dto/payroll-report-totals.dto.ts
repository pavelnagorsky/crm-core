import {
  ApiPrice,
  ApiSignedAmount,
} from '../../../../shared/decorators/api-decimal.decorator.js';

export class PayrollReportTotalsDto {
  @ApiPrice()
  fixedSalaryTotal: string;

  @ApiPrice()
  hourlyTotal: string;

  @ApiPrice()
  serviceCommissionTotal: string;

  @ApiPrice()
  productCommissionTotal: string;

  @ApiPrice()
  bonusTotal: string;

  @ApiSignedAmount()
  deductionTotal: string;

  @ApiSignedAmount()
  correctionTotal: string;
}
