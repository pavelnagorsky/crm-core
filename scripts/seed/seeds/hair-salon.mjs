import { Prisma } from '@prisma/client';
import { createRng } from '../lib/random.mjs';
import { commission, hourly, hoursFromShift, decimal } from '../lib/money.mjs';
import {
  localToUtc,
  dateOnly,
  dateOnlyStr,
  zonedDateStr,
  parseTimeToDbTime,
  isoWeekday,
  enumerateDates,
  addDaysStr,
  minutesToHHmm,
  hhmmToMinutes,
} from '../lib/time.mjs';

export const meta = {
  name: 'hair-salon',
  description: 'Realistic hair salon demo: 4 staff, schedules, blocks, bookings, earnings',
};

// ─── Tunables ──────────────────────────────────────────────────────────────────
const SEED = 20260928; // deterministic RNG seed
const BUSINESS_NAME = 'Салон красоты «Локон»';
const PAST_MONTHS = 3;
const FUTURE_WEEKS = 3;
const LUNCH = { start: '13:00', end: '14:00' };

// Weekly work patterns. workDays = ISO weekdays (1=Mon..7=Sun). Lunch applies on work days.
// role → StaffService selection is done via SERVICE_TAGS below.
const STAFF_PLAN = [
  {
    key: 'stylist',
    name: 'Мария Ковалёва',
    roleTitle: 'Стилист-парикмахер',
    employmentType: 'LABOR_CONTRACT',
    payoutMethod: 'CARD',
    workDays: [1, 2, 3, 4, 5], // Mon–Fri
    shift: { start: '09:00', end: '18:00' },
    dayOffChance: 0.06,
    plan: { fixedSalaryAmount: '900.00', hourlyRate: '14.00', serviceCommissionPercent: '25.00', salaryMode: 'GUARANTEED_MINIMUM' },
    categories: ['Стрижки', 'Укладки и причёски', 'Уход за волосами', 'Выпрямление и завивка'],
  },
  {
    key: 'colorist',
    name: 'Александра Мельник',
    roleTitle: 'Колорист',
    employmentType: 'LABOR_CONTRACT',
    payoutMethod: 'CARD',
    workDays: [3, 4, 5, 6, 7], // Wed–Sun
    shift: { start: '10:00', end: '19:00' },
    dayOffChance: 0.06,
    plan: { fixedSalaryAmount: '1000.00', hourlyRate: '15.00', serviceCommissionPercent: '30.00', salaryMode: 'GUARANTEED_MINIMUM' },
    categories: ['Окрашивание', 'Уход за волосами', 'Выпрямление и завивка'],
  },
  {
    key: 'universal',
    name: 'Ирина Савицкая',
    roleTitle: 'Парикмахер-универсал',
    employmentType: 'CIVIL_CONTRACT',
    payoutMethod: 'BANK_TRANSFER',
    workDays: [1, 3, 5, 6], // Mon, Wed, Fri, Sat
    shift: { start: '09:00', end: '17:00' },
    dayOffChance: 0.08,
    plan: { fixedSalaryAmount: null, hourlyRate: '12.00', serviceCommissionPercent: '35.00', salaryMode: 'ADDITIVE' },
    categories: ['Стрижки', 'Укладки и причёски', 'Уход за волосами'],
  },
  {
    key: 'barber',
    name: 'Дмитрий Романов',
    roleTitle: 'Барбер',
    employmentType: 'SELF_EMPLOYED',
    payoutMethod: 'CASH',
    workDays: [2, 3, 4, 5, 6], // Tue–Sat
    shift: { start: '11:00', end: '20:00' },
    dayOffChance: 0.05,
    plan: { fixedSalaryAmount: null, hourlyRate: '10.00', serviceCommissionPercent: '40.00', salaryMode: 'ADDITIVE' },
    // Barber: only male/kids cuts + care (women's cut is INACTIVE anyway).
    services: ['Мужская стрижка', 'Детская стрижка', 'Восстанавливающий уход', 'Уход для блеска волос'],
  },
];

// One-off blocks (CalendarEvent NONE). offsetDays relative to today (negative = past).
const ONE_OFF_BLOCKS = [
  { staffKey: 'stylist', offsetDays: -40, start: '15:00', end: '17:00', title: 'Обучение', reason: 'Мастер-класс' },
  { staffKey: 'colorist', offsetDays: -18, start: '10:00', end: '12:00', title: 'Личное', reason: null },
  { staffKey: 'barber', offsetDays: 5, start: '11:00', end: '13:00', title: 'Технический перерыв', reason: 'Обслуживание оборудования' },
  { staffKey: 'universal', offsetDays: 9, start: '09:00', end: '11:00', title: 'Личное', reason: null },
];

// Popularity weights for service selection (higher = booked more often).
const SERVICE_WEIGHTS = {
  'Мужская стрижка': 10,
  'Детская стрижка': 6,
  'Укладка феном': 8,
  'Вечерняя причёска': 4,
  'Восстанавливающий уход': 5,
  'Уход для блеска волос': 4,
  'Окрашивание в один тон': 6,
  'Окрашивание корней': 7,
  'Сложное окрашивание': 2,
  'Кератиновое выпрямление': 2,
  'Химическая завивка': 1,
};

const BOOKING_SOURCE_WEIGHTS = [
  ['PUBLIC_PAGE', 5],
  ['WIDGET', 3],
  ['MANUAL', 2],
];

const CANCEL_REASONS = ['Клиент заболел', 'Перенос по просьбе клиента', 'Не смогла прийти', 'Изменились планы', 'Форс-мажор'];
const INTERNAL_NOTES = ['Постоянный клиент', 'Просил тихую музыку', 'Аллергия на аммиак — уточнить состав', 'ВИП, предложить кофе'];
const NOTES = ['Хочет каре', 'Как в прошлый раз', 'Пробное окрашивание', 'Уложить к вечеру'];

// Target salon-wide bookings per open day (medium density). Actual per-staff is a share of this.
const DAILY_TARGET = { min: 4, max: 8 };

// ─── Seed entry ──────────────────────────────────────────────────────────────────
export async function seed(prisma) {
  const rng = createRng(SEED);
  const now = new Date();

  const business = await prisma.business.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!business) throw new Error('No business found — create the business/services/clients first.');
  const { id: businessId, timezone, currency, slotIntervalMinutes } = business;

  const [services, clients] = await Promise.all([
    prisma.service.findMany({ where: { businessId }, include: { category: true } }),
    prisma.client.findMany({ where: { businessId } }),
  ]);
  if (clients.length === 0) throw new Error('No clients found for this business.');
  const activeServices = services.filter((s) => s.status === 'ACTIVE');
  const serviceByTitle = new Map(services.map((s) => [s.title, s]));

  const dateRange = computeDateRange(now, timezone);
  console.log(`  Business: ${business.name} (${timezone}, ${currency}), range ${dateRange.from}..${dateRange.to}`);

  // 1. Clean previously seeded generated data (idempotent re-runs). FK-safe order.
  await cleanup(prisma, businessId);

  // 2. Business rename.
  await prisma.business.update({ where: { id: businessId }, data: { name: BUSINESS_NAME } });

  // 3. Staff: rename existing two, create the rest, wire StaffService.
  const staffList = await upsertStaff(prisma, businessId, activeServices, rng);
  ensureCoverage(activeServices, staffList);

  // 4. Compensation plans covering the whole history.
  const planByStaff = await createPlans(prisma, businessId, staffList, dateRange.from);

  // 5. Shifts.
  const shiftIndex = await createShifts(prisma, staffList, dateRange, rng);

  // 6. Recurring lunch blocks + one-off blocks.
  const blocksByStaffDate = await createBlocks(prisma, businessId, staffList, dateRange, timezone, now);

  // 7. Bookings (+ linked CalendarEvent per booking) and 8. earnings.
  const stats = await createBookings(prisma, {
    businessId, timezone, currency, slotIntervalMinutes,
    staffList, clients, serviceByTitle, planByStaff, shiftIndex, blocksByStaffDate,
    dateRange, now, rng,
  });

  // Hourly earnings for past shifts (enriches payroll demo).
  const hourlyCount = await createHourlyEarnings(prisma, { businessId, currency, staffList, planByStaff, shiftIndex, now, timezone });

  printSummary({ staffList, dateRange, shiftCount: countShifts(shiftIndex), stats, hourlyCount, currency });
}

// ─── Date range ────────────────────────────────────────────────────────────────
function computeDateRange(now, timezone) {
  const todayStr = zonedDateStr(now, timezone);
  const [y, m, d] = todayStr.split('-').map(Number);
  const fromDate = new Date(Date.UTC(y, m - 1 - PAST_MONTHS, d));
  const from = dateOnlyStr(fromDate);
  const to = addDaysStr(todayStr, FUTURE_WEEKS * 7);
  return { from, to, todayStr };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
async function cleanup(prisma, businessId) {
  // earnings reference bookings; bookings reference calendarEvents (SetNull). Delete earnings first,
  // then bookings, then all calendar events, shifts, plans, and previously-seeded new staff.
  await prisma.staffEarning.deleteMany({ where: { businessId } });
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.calendarEvent.deleteMany({ where: { businessId } });
  await prisma.staffShift.deleteMany({ where: { staff: { businessId } } });
  await prisma.staffCompensationPlan.deleteMany({ where: { businessId } });
  // Remove staff created by a previous seed run (tagged via email marker), keep the original ones.
  await prisma.staff.deleteMany({ where: { businessId, email: { endsWith: '@seed.lokon' } } });
}

// ─── Staff ────────────────────────────────────────────────────────────────────
function resolveStaffServices(planEntry, activeServices) {
  const chosen = new Set();
  if (planEntry.services) {
    for (const s of activeServices) if (planEntry.services.includes(s.title)) chosen.add(s.id);
  }
  if (planEntry.categories) {
    for (const s of activeServices) if (s.category && planEntry.categories.includes(s.category.name)) chosen.add(s.id);
  }
  return [...chosen];
}

async function upsertStaff(prisma, businessId, activeServices, rng) {
  const existing = await prisma.staff.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
  const result = [];

  for (let i = 0; i < STAFF_PLAN.length; i++) {
    const p = STAFF_PLAN[i];
    const serviceIds = resolveStaffServices(p, activeServices);
    const data = {
      name: p.name,
      roleTitle: p.roleTitle,
      employmentType: p.employmentType,
      payoutMethod: p.payoutMethod,
      status: 'ACTIVE',
    };

    let staff;
    if (existing[i]) {
      // Rename/repurpose an existing staff member, preserving its id/userId.
      staff = await prisma.staff.update({
        where: { id: existing[i].id },
        data: {
          ...data,
          staffServices: { deleteMany: {}, create: serviceIds.map((serviceId) => ({ serviceId })) },
        },
      });
    } else {
      staff = await prisma.staff.create({
        data: {
          businessId,
          email: `${p.key}@seed.lokon`,
          ...data,
          staffServices: { create: serviceIds.map((serviceId) => ({ serviceId })) },
        },
      });
    }
    result.push({ ...p, id: staff.id, name: staff.name, serviceIds });
  }
  return result;
}

function ensureCoverage(activeServices, staffList) {
  const covered = new Set();
  for (const s of staffList) for (const id of s.serviceIds) covered.add(id);
  const missing = activeServices.filter((s) => !covered.has(s.id));
  if (missing.length) {
    // Attach any uncovered active service to the universal staff so slots exist for it.
    const fallback = staffList.find((s) => s.key === 'universal') ?? staffList[0];
    for (const svc of missing) fallback.serviceIds.push(svc.id);
    console.warn(`  ! ${missing.length} active service(s) had no staff; attached to ${fallback.name}`);
  }
}

// ─── Compensation plans ──────────────────────────────────────────────────────────
async function createPlans(prisma, businessId, staffList, fromStr) {
  const effectiveFrom = dateOnly(fromStr);
  const byStaff = new Map();
  for (const s of staffList) {
    const plan = await prisma.staffCompensationPlan.create({
      data: {
        businessId,
        staffId: s.id,
        effectiveFrom,
        fixedSalaryAmount: s.plan.fixedSalaryAmount,
        hourlyRate: s.plan.hourlyRate,
        serviceCommissionPercent: s.plan.serviceCommissionPercent,
        salaryMode: s.plan.salaryMode,
      },
    });
    byStaff.set(s.id, plan);
  }
  return byStaff;
}

// ─── Shifts ───────────────────────────────────────────────────────────────────
async function createShifts(prisma, staffList, dateRange, rng) {
  const dates = enumerateDates(dateRange.from, dateRange.to);
  const rows = [];
  // index: staffId -> dateStr -> { startMin, endMin, shiftId (filled after) }
  const index = new Map();

  for (const s of staffList) {
    const byDate = new Map();
    index.set(s.id, byDate);
    for (const dateStr of dates) {
      const [y, m, d] = dateStr.split('-').map(Number);
      const wd = isoWeekday(y, m, d);
      if (!s.workDays.includes(wd)) continue;
      if (rng.chance(s.dayOffChance)) continue; // occasional day off
      rows.push({
        staffId: s.id,
        date: dateOnly(dateStr),
        startTime: parseTimeToDbTime(s.shift.start),
        endTime: parseTimeToDbTime(s.shift.end),
      });
      byDate.set(dateStr, {
        startMin: hhmmToMinutes(s.shift.start),
        endMin: hhmmToMinutes(s.shift.end),
      });
    }
  }

  await prisma.staffShift.createMany({ data: rows });

  // Fetch back to obtain shift ids (needed for hourly earnings shiftId link).
  const created = await prisma.staffShift.findMany({
    where: { staffId: { in: staffList.map((s) => s.id) } },
  });
  for (const sh of created) {
    const byDate = index.get(sh.staffId);
    const entry = byDate?.get(dateOnlyStr(sh.date));
    if (entry) entry.shiftId = sh.id;
  }
  return index;
}

function countShifts(index) {
  let n = 0;
  for (const byDate of index.values()) n += byDate.size;
  return n;
}

// ─── Blocks ───────────────────────────────────────────────────────────────────
async function createBlocks(prisma, businessId, staffList, dateRange, timezone, now) {
  // blocksByStaffDate: staffId -> dateStr -> [{start,end}] minute intervals to avoid.
  const blocks = new Map();
  const addBlock = (staffId, dateStr, start, end) => {
    if (!blocks.has(staffId)) blocks.set(staffId, new Map());
    const byDate = blocks.get(staffId);
    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr).push({ start, end });
  };

  const repeatUntil = dateOnly(dateRange.to);

  // Recurring lunch per staff on their work days.
  for (const s of staffList) {
    const daysMask = buildDaysMask(s.workDays);
    // startDateTime anchors the wall-clock time; use range start date at lunch time.
    const startDateTime = localToUtc(`${dateRange.from}T${LUNCH.start}:00`, timezone);
    const endDateTime = localToUtc(`${dateRange.from}T${LUNCH.end}:00`, timezone);
    await prisma.calendarEvent.create({
      data: {
        businessId,
        staffId: s.id,
        type: 'BLOCK',
        title: 'Обед',
        repeatType: 'WEEKLY',
        startDateTime,
        endDateTime,
        daysMask,
        repeatUntil,
      },
    });
    // Register lunch on every work date so booking packing avoids it.
    for (const dateStr of enumerateDates(dateRange.from, dateRange.to)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      if (s.workDays.includes(isoWeekday(y, m, d))) {
        addBlock(s.id, dateStr, hhmmToMinutes(LUNCH.start), hhmmToMinutes(LUNCH.end));
      }
    }
  }

  // One-off blocks.
  for (const b of ONE_OFF_BLOCKS) {
    const s = staffList.find((x) => x.key === b.staffKey);
    if (!s) continue;
    const dateStr = addDaysStr(dateRange.todayStr, b.offsetDays);
    if (dateStr < dateRange.from || dateStr > dateRange.to) continue;
    await prisma.calendarEvent.create({
      data: {
        businessId,
        staffId: s.id,
        type: 'BLOCK',
        title: b.title,
        reason: b.reason,
        repeatType: 'NONE',
        startDateTime: localToUtc(`${dateStr}T${b.start}:00`, timezone),
        endDateTime: localToUtc(`${dateStr}T${b.end}:00`, timezone),
      },
    });
    addBlock(s.id, dateStr, hhmmToMinutes(b.start), hhmmToMinutes(b.end));
  }

  return blocks;
}

function buildDaysMask(workDays) {
  // daysMask indexed 0=Mon..6=Sun.
  const chars = ['0', '0', '0', '0', '0', '0', '0'];
  for (const wd of workDays) chars[wd - 1] = '1';
  return chars.join('');
}

// ─── Interval math (free = shift minus blocks) ──────────────────────────────────
function subtractIntervals(view, blocked) {
  const sorted = [...blocked].filter((i) => i.start < i.end).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const iv of sorted) {
    const clamped = { start: Math.max(iv.start, view.start), end: Math.min(iv.end, view.end) };
    if (clamped.start >= clamped.end) continue;
    if (merged.length === 0 || clamped.start > merged[merged.length - 1].end) merged.push(clamped);
    else merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, clamped.end);
  }
  const free = [];
  let cursor = view.start;
  for (const iv of merged) {
    if (iv.start > cursor) free.push({ start: cursor, end: iv.start });
    cursor = Math.max(cursor, iv.end);
  }
  if (cursor < view.end) free.push({ start: cursor, end: view.end });
  return free;
}

// ─── Bookings + per-booking CalendarEvent + commission earnings ──────────────────
async function createBookings(prisma, ctx) {
  const {
    businessId, timezone, currency, slotIntervalMinutes,
    staffList, clients, serviceByTitle, planByStaff, shiftIndex, blocksByStaffDate,
    dateRange, now, rng,
  } = ctx;

  const stats = { total: 0, byStatus: {}, earnings: 0, commissionSum: decimal(0) };
  const bump = (st) => { stats.byStatus[st] = (stats.byStatus[st] ?? 0) + 1; stats.total++; };
  const dates = enumerateDates(dateRange.from, dateRange.to);
  const earningRows = []; // buffered, inserted via createMany at the end
  const serviceById = new Map([...serviceByTitle.values()].map((s) => [s.id, s]));

  let lastMonth = '';
  for (const dateStr of dates) {
    const month = dateStr.slice(0, 7);
    if (month !== lastMonth) { process.stdout.write(`  bookings: ${month} ...\n`); lastMonth = month; }
    // Salon-wide daily target, distributed across staff working that day.
    const workingStaff = staffList.filter((s) => shiftIndex.get(s.id)?.has(dateStr));
    if (workingStaff.length === 0) continue;
    const dailyTarget = rng.int(DAILY_TARGET.min, DAILY_TARGET.max);
    // Give each working staff a share (roughly even, with jitter), capped by capacity.
    const perStaffTarget = Math.max(1, Math.round(dailyTarget / workingStaff.length));

    for (const s of workingStaff) {
      const shift = shiftIndex.get(s.id).get(dateStr);
      const blocks = blocksByStaffDate.get(s.id)?.get(dateStr) ?? [];
      const free = subtractIntervals({ start: shift.startMin, end: shift.endMin }, blocks);

      const bookableServices = s.serviceIds
        .map((id) => serviceById.get(id))
        .filter((sv) => sv && sv.status === 'ACTIVE');
      if (bookableServices.length === 0) continue;

      let placed = 0;
      const target = Math.max(1, perStaffTarget + rng.int(-1, 1));
      // Track occupied intervals per staff/day to prevent overlaps.
      const occupied = [...blocks];

      // Walk free intervals, attempt to place bookings on the slot grid.
      for (const interval of free) {
        let cursor = alignUp(interval.start, slotIntervalMinutes);
        while (cursor < interval.end && placed < target) {
          // Occasionally skip a slot to leave realistic gaps.
          if (rng.chance(0.35)) { cursor += slotIntervalMinutes; continue; }

          const svc = pickService(bookableServices, rng);
          const reserve = svc.durationMinutes + svc.bufferMinutes;
          const endMin = cursor + reserve;
          if (endMin > interval.end) { cursor += slotIntervalMinutes; continue; }
          if (overlaps(occupied, cursor, endMin)) { cursor += slotIntervalMinutes; continue; }

          await placeBooking(prisma, {
            businessId, timezone, currency, staff: s, service: svc, client: pickClient(clients, rng),
            dateStr, startMin: cursor, plan: planByStaff.get(s.id), now, rng, stats, bump, earningRows,
          });
          occupied.push({ start: cursor, end: endMin });
          placed++;
          cursor = alignUp(endMin, slotIntervalMinutes);
        }
        if (placed >= target) break;
      }
    }
  }

  if (earningRows.length) await prisma.staffEarning.createMany({ data: earningRows });
  return stats;
}

function alignUp(v, step) { return Math.ceil(v / step) * step; }
function overlaps(intervals, start, end) { return intervals.some((i) => start < i.end && end > i.start); }

function pickService(services, rng) {
  const items = services.map((s) => [s, SERVICE_WEIGHTS[s.title] ?? 3]);
  return rng.weighted(items);
}

function pickClient(clients, rng) {
  // Bias toward a "regulars" subset so some clients recur.
  const regularsCount = Math.max(3, Math.floor(clients.length * 0.4));
  if (rng.chance(0.6)) return clients[rng.int(0, regularsCount - 1)];
  return clients[rng.int(0, clients.length - 1)];
}

async function placeBooking(prisma, p) {
  const { businessId, timezone, currency, staff, service, client, dateStr, startMin, plan, now, rng, stats, bump, earningRows } = p;
  const startAt = localToUtc(`${dateStr}T${minutesToHHmm(startMin)}:00`, timezone);
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  const status = resolveStatus(endAt, now, rng);
  const source = rng.weighted(BOOKING_SOURCE_WEIGHTS);
  const isCancelled = status === 'CANCELLED';

  // Rare custom price (discount for a regular).
  const customPrice = rng.chance(0.08) ? applyDiscount(service.price, rng) : null;

  // Linked CalendarEvent (BLOCK) — exactly as booking-create.service.ts does at runtime.
  const calendarEvent = await prisma.calendarEvent.create({
    data: {
      businessId,
      staffId: staff.id,
      type: 'BLOCK',
      repeatType: 'NONE',
      startDateTime: startAt,
      endDateTime: endAt,
    },
  });

  const cancelledBy = isCancelled ? (rng.chance(0.6) ? 'CLIENT' : 'STAFF') : null;
  const booking = await prisma.booking.create({
    data: {
      businessId,
      staffId: staff.id,
      serviceId: service.id,
      clientId: client.id,
      startAt,
      endAt,
      status,
      source,
      clientFirstName: client.firstName,
      clientLastName: client.lastName,
      clientPhone: client.phone,
      clientEmail: client.email ?? null,
      serviceTitle: service.title,
      serviceDuration: service.durationMinutes,
      servicePrice: service.price,
      customPrice,
      staffName: staff.name,
      calendarEventId: calendarEvent.id,
      notes: rng.chance(0.2) ? rng.pick(NOTES) : null,
      internalNotes: rng.chance(0.15) ? rng.pick(INTERNAL_NOTES) : null,
      cancellationReason: isCancelled ? rng.pick(CANCEL_REASONS) : null,
      cancelledBy,
      cancelledAt: isCancelled ? new Date(startAt.getTime() - rng.int(1, 48) * 3_600_000) : null,
    },
  });
  bump(status);

  // Commission earning for completed bookings (matches createBookingCommission).
  if (status === 'COMPLETED' && plan && plan.serviceCommissionPercent != null) {
    const base = customPrice ?? service.price;
    const percent = plan.serviceCommissionPercent;
    const amount = commission(base, percent);
    const earnedOn = dateOnly(zonedDateStr(startAt, timezone));
    earningRows.push({
      businessId,
      staffId: staff.id,
      type: 'SERVICE_COMMISSION',
      source: 'BOOKING',
      earnedOn,
      amount,
      currency,
      baseAmount: decimal(base),
      ratePercent: decimal(percent),
      description: service.title,
      idempotencyKey: `booking:${booking.id}:SERVICE_COMMISSION`,
      compensationPlanId: plan.id,
      bookingId: booking.id,
    });
    stats.earnings++;
    stats.commissionSum = stats.commissionSum.add(amount);
  }
}

function applyDiscount(price, rng) {
  const pct = rng.pick([10, 15, 20]);
  return decimal(price).mul(100 - pct).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function resolveStatus(endAt, now, rng) {
  if (endAt.getTime() <= now.getTime()) {
    // Past appointment.
    return rng.weighted([
      ['COMPLETED', 80],
      ['CANCELLED', 12],
      ['NO_SHOW', 8],
    ]);
  }
  // Future appointment.
  return rng.weighted([
    ['CONFIRMED', 78],
    ['PENDING', 18],
    ['CANCELLED', 4],
  ]);
}

// ─── Hourly earnings for past shifts ─────────────────────────────────────────────
async function createHourlyEarnings(prisma, ctx) {
  const { businessId, currency, staffList, planByStaff, shiftIndex, now, timezone } = ctx;
  const todayStr = zonedDateStr(now, timezone);
  const rows = [];
  for (const s of staffList) {
    const plan = planByStaff.get(s.id);
    if (!plan || plan.hourlyRate == null) continue;
    const byDate = shiftIndex.get(s.id);
    if (!byDate) continue;
    for (const [dateStr, sh] of byDate) {
      if (dateStr >= todayStr) continue; // only elapsed shifts
      if (!sh.shiftId) continue;
      const hours = hoursFromShift(sh.startMin, sh.endMin);
      const amount = hourly(hours, plan.hourlyRate);
      rows.push({
        businessId,
        staffId: s.id,
        type: 'HOURLY',
        source: 'SHIFT',
        earnedOn: dateOnly(dateStr),
        amount,
        currency,
        rateAmount: decimal(plan.hourlyRate),
        quantity: hours.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
        idempotencyKey: `shift:${sh.shiftId}:HOURLY`,
        compensationPlanId: plan.id,
        shiftId: sh.shiftId,
      });
    }
  }
  if (rows.length) await prisma.staffEarning.createMany({ data: rows });
  return rows.length;
}

// ─── Summary ────────────────────────────────────────────────────────────────────
function printSummary({ staffList, dateRange, shiftCount, stats, hourlyCount, currency }) {
  console.log('\n  ── Summary ──');
  console.log(`  Staff: ${staffList.map((s) => s.name).join(', ')}`);
  console.log(`  Date range: ${dateRange.from} .. ${dateRange.to} (today ${dateRange.todayStr})`);
  console.log(`  Shifts: ${shiftCount}`);
  console.log(`  Bookings: ${stats.total}`);
  for (const [st, n] of Object.entries(stats.byStatus).sort()) console.log(`    ${st.padEnd(10)} ${n}`);
  console.log(`  Commission earnings: ${stats.earnings} (sum ${stats.commissionSum.toFixed(2)} ${currency})`);
  console.log(`  Hourly earnings: ${hourlyCount}`);
}
