import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { normalizeAllowedDomains } from '../allowed-domains.js';

@ValidatorConstraint({ name: 'allowedDomains', async: false })
export class AllowedDomainsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return Array.isArray(value) && value.every((item) => typeof item === 'string') && normalizeAllowedDomains(value) !== null;
  }

  defaultMessage(): string {
    return 'allowedDomains must contain up to 20 hostnames';
  }
}
