import { Prisma, StaffStatus } from '@prisma/client';
import { ServicePricesInput } from '../interfaces/service-prices-input.interface.js';
import { ServicePricesView } from '../interfaces/service-prices-view.interface.js';
import { StaffServicePricesInput } from '../interfaces/staff-service-prices-input.interface.js';
import { StaffServicePricesView } from '../interfaces/staff-service-prices-view.interface.js';

/**
 * Price of a staff member for a service: personal price, else the price of their level,
 * else the base price (docs/pricing-stage2-api.md). The default level has no prices of its own.
 */
export function resolveStaffPrice(
  basePrice: Prisma.Decimal,
  levelPrice: Prisma.Decimal | undefined,
  personalPrice: Prisma.Decimal | null,
): Prisma.Decimal {
  return personalPrice ?? levelPrice ?? basePrice;
}

/** The price cards of one service: levels, staff and the range over active staff. */
export function buildServicePricesView(
  input: ServicePricesInput,
): ServicePricesView {
  const { basePrice } = input;
  const levelById = new Map(input.levels.map((level) => [level.id, level]));
  const defaultLevel = input.levels.find((level) => level.isDefault);
  const levelPriceById = new Map(
    input.levelPrices.map((row) => [row.priceLevelId, row.price]),
  );

  const levels = input.levels.map((level) => ({
    levelId: level.id,
    name: level.name,
    isDefault: level.isDefault,
    price: level.isDefault ? null : (levelPriceById.get(level.id) ?? null),
    staffCount: level.isDefault
      ? (input.staffCounts.get(null) ?? 0) +
        (input.staffCounts.get(level.id) ?? 0)
      : (input.staffCounts.get(level.id) ?? 0),
  }));

  const staff = input.staffRows.map(({ staff: member, personalPrice }) => {
    const level = member.priceLevelId
      ? levelById.get(member.priceLevelId)
      : undefined;
    const levelPrice = resolveStaffPrice(
      basePrice,
      level && !level.isDefault ? levelPriceById.get(level.id) : undefined,
      null,
    );
    return {
      staffId: member.id,
      name: member.name,
      avatarFile: member.avatarFile,
      status: member.status,
      levelId: member.priceLevelId,
      levelName: (level ?? defaultLevel)?.name ?? null,
      levelPrice,
      personalPrice,
      price: personalPrice ?? levelPrice,
    };
  });

  const activePrices = staff
    .filter((member) => member.status === StaffStatus.ACTIVE)
    .map((member) => member.price);
  return {
    serviceId: input.serviceId,
    basePrice,
    priceFrom: activePrices.length
      ? Prisma.Decimal.min(...activePrices)
      : basePrice,
    priceTo: activePrices.length
      ? Prisma.Decimal.max(...activePrices)
      : basePrice,
    levels,
    staff,
  };
}

/** The price list of one staff member over the services they perform, by service title. */
export function buildStaffServicePricesView(
  input: StaffServicePricesInput,
): StaffServicePricesView {
  const levelPriceByService = new Map(
    input.levelPrices.map((row) => [row.serviceId, row.price]),
  );
  return {
    staffId: input.staffId,
    levelId: input.levelId,
    items: input.services.map((service) => {
      const personalPrice = input.personalPrices.get(service.id) ?? null;
      const levelPrice = resolveStaffPrice(
        service.price,
        levelPriceByService.get(service.id),
        null,
      );
      return {
        serviceId: service.id,
        serviceTitle: service.title,
        basePrice: service.price,
        levelPrice,
        personalPrice,
        price: personalPrice ?? levelPrice,
      };
    }),
  };
}
