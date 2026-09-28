import { Prisma } from '@prisma/client';
import { createRng } from '../lib/random.mjs';
import { commission, hourly, hoursFromShift, decimal, quantize, dailySalaryShare, guaranteedTopUp } from '../lib/money.mjs';
import {
  localToUtc,
  dateOnly,
  dateOnlyStr,
  daysInUtcMonth,
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
  description: 'Realistic hair salon demo: 4 staff, schedules, blocks, bookings, earnings, payroll periods',
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
    // Floor sits above a typical month of hourly + commission (prices are 10–120), so the payslip shows a top-up.
    plan: { fixedSalaryAmount: '5500.00', hourlyRate: '14.00', serviceCommissionPercent: '25.00', salaryMode: 'GUARANTEED_MINIMUM' },
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
    plan: { fixedSalaryAmount: '6500.00', hourlyRate: '15.00', serviceCommissionPercent: '30.00', salaryMode: 'GUARANTEED_MINIMUM' },
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

// Active client book for a 4-chair salon. Existing clients are kept; the seed fills up to this size.
// Phones +375291100xxx mark rows this seed owns and may delete on the next run.
const CLIENT_TARGET = 320;
const SEED_PHONE_PREFIX = '+375291100';
const DORMANT_SHARE = 0.12;

const FEMALE_NAMES = [
  'Анна', 'Мария', 'Елена', 'Ольга', 'Татьяна', 'Наталья', 'Ирина', 'Светлана', 'Юлия', 'Екатерина',
  'Дарья', 'Алина', 'Виктория', 'Полина', 'Ксения', 'Анастасия', 'Валерия', 'Кристина', 'Вероника', 'Диана',
  'Алёна', 'Маргарита', 'София', 'Арина', 'Милана', 'Карина', 'Яна', 'Лидия', 'Галина', 'Лариса',
  'Инна', 'Оксана', 'Жанна', 'Регина', 'Элина', 'Василиса', 'Кира', 'Алиса', 'Ульяна', 'Злата',
  'Ева', 'Варвара', 'Нина', 'Людмила', 'Вера', 'Ангелина', 'Ярослава', 'Алла', 'Майя', 'Лилия',
  'Каролина', 'Влада', 'Милена', 'Эвелина', 'Доминика', 'Богдана',
];
const MALE_NAMES = [
  'Александр', 'Дмитрий', 'Сергей', 'Андрей', 'Алексей', 'Максим', 'Иван', 'Никита', 'Артём', 'Илья',
  'Павел', 'Роман', 'Кирилл', 'Егор', 'Михаил', 'Владимир', 'Олег', 'Денис', 'Антон', 'Виктор',
  'Глеб', 'Тимофей', 'Матвей', 'Фёдор', 'Борис', 'Игорь', 'Степан', 'Юрий',
];
const FEMALE_SURNAMES = [
  'Иванова', 'Петрова', 'Сидорова', 'Козлова', 'Новикова', 'Морозова', 'Соколова', 'Лебедева', 'Кузнецова', 'Попова',
  'Орлова', 'Фёдорова', 'Белова', 'Михайлова', 'Волкова', 'Павлова', 'Смирнова', 'Никитина', 'Захарова', 'Зайцева',
  'Соловьёва', 'Борисова', 'Яковлева', 'Григорьева', 'Сергеева', 'Максимова', 'Тарасова', 'Комарова', 'Киселёва', 'Макарова',
  'Андреева', 'Ильина', 'Гусева', 'Титова', 'Кузьмина', 'Куликова', 'Карпова', 'Власова', 'Медведева', 'Ершова',
  'Денисова', 'Громова', 'Фомина', 'Давыдова', 'Щербакова', 'Блинова', 'Колесникова', 'Афанасьева', 'Маслова', 'Исаева',
  'Чернова', 'Савельева', 'Жукова', 'Баранова', 'Котова', 'Филиппова', 'Маркова',
];
const CLIENT_NOTES = [
  'Стрижка каждые 5 недель',
  'Аллергия на аммиак',
  'Просит одного мастера',
  'Не предлагать доп. услуги',
  'Скидка в день рождения',
  'Удобно только после 17:00',
  'Чувствительная кожа головы',
];
const BAN_REASONS = ['Не пришёл трижды без предупреждения', 'Грубость к мастеру', 'Неоплаченный визит'];
const EMAIL_DOMAINS = ['mail.ru', 'gmail.com', 'yandex.by'];

// ─── Seed entry ──────────────────────────────────────────────────────────────────
export async function seed(prisma) {
  const rng = createRng(SEED);
  const now = new Date();

  const business = await prisma.business.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!business) throw new Error('No business found — create the business/services/clients first.');
  const { id: businessId, timezone, currency, slotIntervalMinutes } = business;

  const services = await prisma.service.findMany({ where: { businessId }, include: { category: true } });
  const activeServices = services.filter((s) => s.status === 'ACTIVE');
  const serviceByTitle = new Map(services.map((s) => [s.title, s]));

  const dateRange = computeDateRange(now, timezone);
  console.log(`  Business: ${business.name} (${timezone}, ${currency}), range ${dateRange.from}..${dateRange.to}`);

  // 1. Clean previously seeded generated data (idempotent re-runs). FK-safe order.
  await cleanup(prisma, businessId);

  // 2. Business rename.
  await prisma.business.update({ where: { id: businessId }, data: { name: BUSINESS_NAME } });

  // 3. Client book: keep whoever already exists, fill up to a realistic salon size.
  const clients = await ensureClients(prisma, businessId, now, timezone);

  // 4. Staff: rename existing two, create the rest, wire StaffService.
  const staffList = await upsertStaff(prisma, businessId, activeServices, rng);
  ensureCoverage(activeServices, staffList);

  // 5. Compensation plans covering the whole history.
  const planByStaff = await createPlans(prisma, businessId, staffList, dateRange.from);

  // 6. Shifts.
  const shiftIndex = await createShifts(prisma, staffList, dateRange, rng);

  // 7. Recurring lunch blocks + one-off blocks.
  const blocksByStaffDate = await createBlocks(prisma, businessId, staffList, dateRange, timezone, now);

  // 8. Bookings (+ linked CalendarEvent per booking) and earnings.
  const stats = await createBookings(prisma, {
    businessId, timezone, currency, slotIntervalMinutes,
    staffList, clients: clients.bookable, serviceByTitle, planByStaff, shiftIndex, blocksByStaffDate,
    dateRange, now, rng,
  });

  // Hourly earnings for past shifts (enriches payroll demo).
  const hourlyCount = await createHourlyEarnings(prisma, { businessId, currency, staffList, planByStaff, shiftIndex, now, timezone });

  // 9. Monthly payroll periods: salary top-up, then a statement that locks earnings.
  const payroll = await createPayrollPeriods(prisma, { businessId, currency, staffList, planByStaff, dateRange, now, timezone });

  printSummary({ staffList, dateRange, shiftCount: countShifts(shiftIndex), stats, hourlyCount, payroll, clients, currency });
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
  // Periods cascade to results (which restrict staff deletion). Earnings reference bookings;
  // bookings reference calendarEvents (SetNull). Then shifts, plans, and previously-seeded staff.
  await prisma.payrollPeriod.deleteMany({ where: { businessId } });
  await prisma.staffEarning.deleteMany({ where: { businessId } });
  await prisma.booking.deleteMany({ where: { businessId } });
  await prisma.client.deleteMany({ where: { businessId, phone: { startsWith: SEED_PHONE_PREFIX } } });
  await prisma.calendarEvent.deleteMany({ where: { businessId } });
  await prisma.staffShift.deleteMany({ where: { staff: { businessId } } });
  await prisma.staffCompensationPlan.deleteMany({ where: { businessId } });
  // Remove staff created by a previous seed run (tagged via email marker), keep the original ones.
  await prisma.staff.deleteMany({ where: { businessId, email: { endsWith: '@seed.lokon' } } });
}

// ─── Clients ──────────────────────────────────────────────────────────────────
async function ensureClients(prisma, businessId, now, timezone) {
  const rng = createRng(SEED + 91);
  const existing = await prisma.client.findMany({ where: { businessId } });
  const taken = new Set(existing.map((c) => c.phone));
  const need = Math.max(0, CLIENT_TARGET - existing.length);
  const todayStr = zonedDateStr(now, timezone);
  const rows = [];
  const seenNames = new Set(existing.map((c) => `${c.firstName}|${c.lastName}`));
  let seq = 1;

  while (rows.length < need) {
    const phone = `${SEED_PHONE_PREFIX}${String(seq).padStart(3, '0')}`;
    seq += 1;
    if (taken.has(phone)) continue;
    if (seq > 999) throw new Error('Ran out of seed phone numbers for clients.');

    const female = rng.chance(0.72);
    let firstName = rng.pick(female ? FEMALE_NAMES : MALE_NAMES);
    let lastName = female ? rng.pick(FEMALE_SURNAMES) : masculineSurname(rng.pick(FEMALE_SURNAMES));
    let guard = 0;
    while (seenNames.has(`${firstName}|${lastName}`) && guard < 8) {
      firstName = rng.pick(female ? FEMALE_NAMES : MALE_NAMES);
      lastName = female ? rng.pick(FEMALE_SURNAMES) : masculineSurname(rng.pick(FEMALE_SURNAMES));
      guard += 1;
    }
    seenNames.add(`${firstName}|${lastName}`);

    const banned = rows.length >= need - 3;
    rows.push({
      businessId,
      firstName,
      lastName,
      phone,
      email: rng.chance(0.55) ? clientEmail(rng, seq, firstName, lastName) : null,
      birthDate: rng.chance(0.8) ? birthDate(rng, todayStr) : null,
      gender: female ? 'FEMALE' : 'MALE',
      notes: rng.chance(0.12) ? rng.pick(CLIENT_NOTES) : null,
      bannedAt: banned ? new Date(now.getTime() - rng.int(20, 80) * 86_400_000) : null,
      banReason: banned ? rng.pick(BAN_REASONS) : null,
      createdAt: new Date(now.getTime() - rng.int(14, 540) * 86_400_000),
    });
  }

  if (rows.length) await prisma.client.createMany({ data: rows });

  const all = await prisma.client.findMany({ where: { businessId } });
  return { total: all.length, bookable: bookingPool(all) };
}

function masculineSurname(surname) {
  if (surname.endsWith('ова')) return `${surname.slice(0, -3)}ов`;
  if (surname.endsWith('ева')) return `${surname.slice(0, -3)}ев`;
  if (surname.endsWith('ёва')) return `${surname.slice(0, -3)}ёв`;
  if (surname.endsWith('ина')) return `${surname.slice(0, -3)}ин`;
  return surname;
}

function clientEmail(rng, seq, firstName, lastName) {
  const local = `${translit(firstName)}.${translit(lastName)}`;
  const suffix = rng.chance(0.25) ? String(seq) : '';
  return `${local}${suffix}@${rng.pick(EMAIL_DOMAINS)}`;
}

function translit(value) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return value.toLowerCase().split('').map((ch) => map[ch] ?? ch).join('');
}

function birthDate(rng, todayStr) {
  const [y] = todayStr.split('-').map(Number);
  const age = rng.int(18, 64);
  const month = String(rng.int(1, 12)).padStart(2, '0');
  const day = String(rng.int(1, 28)).padStart(2, '0');
  return dateOnly(`${y - age}-${month}-${day}`);
}

function bookingPool(all) {
  const active = all.filter((c) => !c.bannedAt);
  const seeded = active
    .filter((c) => c.phone.startsWith(SEED_PHONE_PREFIX))
    .sort((a, b) => a.phone.localeCompare(b.phone));
  const original = active.filter((c) => !c.phone.startsWith(SEED_PHONE_PREFIX));
  const dormantCount = Math.min(seeded.length, Math.round(seeded.length * DORMANT_SHARE));
  const visiting = seeded.slice(0, seeded.length - dormantCount);
  // Originals sit at the front, inside the regulars window pickClient uses.
  return [...original, ...visiting];
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
            businessId, timezone, currency, staff: s, service: svc, client: pickClient(clients, rng, s),
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

function pickClient(clients, rng, staff) {
  // Front of the list is the regulars window: about every 4–6 weeks.
  // The long tail is everyone else, mostly one visit in the seeded quarter.
  const regularsCount = Math.max(3, Math.floor(clients.length * 0.4));
  const fromRegulars = rng.chance(0.6);
  const pool = fromRegulars ? clients.slice(0, regularsCount) : clients;
  const idx = rng.int(0, pool.length - 1);
  // Barber's chair is mostly men; the other chairs are mostly women. Same RNG budget either way.
  const prefer = staff?.key === 'barber' ? 'MALE' : 'FEMALE';
  if (idx % 5 !== 0) {
    const matched = pool.filter((c) => c.gender === prefer);
    if (matched.length) return matched[idx % matched.length];
  }
  return pool[idx];
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

// ─── Payroll periods + fixed-salary top-up ───────────────────────────────────────
// Mirrors PayrollService.calculate: prorate the monthly salary across calendar days,
// pay a guaranteed top-up (or the full amount in ADDITIVE mode), then attach every
// still-unpaid earning through the period end to a result.
const FLOOR_TYPES = new Set(['SERVICE_COMMISSION', 'PRODUCT_COMMISSION', 'HOURLY']);
const EARNING_TOTAL_FIELD = {
  FIXED_SALARY: 'fixedSalaryTotal',
  HOURLY: 'hourlyTotal',
  SERVICE_COMMISSION: 'serviceCommissionTotal',
  PRODUCT_COMMISSION: 'productCommissionTotal',
  BONUS: 'bonusTotal',
  DEDUCTION: 'deductionTotal',
  CORRECTION: 'correctionTotal',
};
const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

async function createPayrollPeriods(prisma, ctx) {
  const { businessId, currency, staffList, planByStaff, dateRange, now, timezone } = ctx;
  const todayStr = dateRange.todayStr;
  const months = calendarMonthsThrough(dateRange.from, todayStr);
  const lastClosed = [...months].reverse().find((m) => m.end < todayStr);

  const [pool, members, approver] = await Promise.all([
    prisma.staffEarning.findMany({
      where: { businessId },
      orderBy: [{ staffId: 'asc' }, { earnedOn: 'asc' }],
    }),
    prisma.staff.findMany({ where: { id: { in: staffList.map((s) => s.id) } } }),
    loadApprover(prisma, businessId),
  ]);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const attached = new Set();
  const periods = [];

  for (const month of months) {
    const status = payrollStatus(month, todayStr, lastClosed);
    const period = await prisma.payrollPeriod.create({
      data: {
        businessId,
        name: month.name,
        startDate: dateOnly(month.start),
        endDate: dateOnly(month.end),
        currency,
        status,
        ...payrollStamps(status, month.end, timezone, now, approver),
      },
    });

    const dates = enumerateDates(month.start, month.end);
    for (const s of staffList) {
      const plan = planByStaff.get(s.id);
      if (!plan || plan.fixedSalaryAmount == null) continue;
      const proration = prorateSalary([plan], dates);
      const inPeriod = pool.filter(
        (e) => e.staffId === s.id && !attached.has(e.id) && e.currency === currency && inDateRange(e.earnedOn, month.start, month.end),
      );
      const amount = salaryAmount(proration, inPeriod);
      if (amount.lte(0) || !proration.planId) continue;
      const earning = await prisma.staffEarning.create({
        data: {
          businessId,
          staffId: s.id,
          type: 'FIXED_SALARY',
          source: 'PAYROLL',
          earnedOn: dateOnly(month.end),
          amount,
          currency,
          rateAmount: proration.lastSalary,
          quantity: decimal(proration.daysCovered),
          idempotencyKey: `salary:${period.id}:${s.id}`,
          compensationPlanId: proration.planId,
        },
      });
      pool.push(earning);
    }

    const unpaid = pool.filter(
      (e) => !attached.has(e.id) && e.currency === currency && dateOnlyStr(e.earnedOn) <= month.end,
    );
    const byStaff = groupBy(unpaid, (e) => e.staffId);
    let salarySum = decimal(0);
    let totalSum = decimal(0);

    for (const [staffId, rows] of byStaff) {
      const member = memberById.get(staffId);
      if (!member || rows.length === 0) continue;
      const totals = totalsFrom(rows);
      const result = await prisma.payrollResult.create({
        data: {
          periodId: period.id,
          businessId,
          staffId,
          staffName: member.name,
          roleTitle: member.roleTitle,
          taxId: member.taxId,
          employeeNumber: member.employeeNumber,
          employmentType: member.employmentType,
          payoutMethod: member.payoutMethod,
          payoutNote: member.payoutNote,
          currency,
          ...totals,
        },
      });
      await prisma.staffEarning.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { payrollResultId: result.id },
      });
      for (const row of rows) attached.add(row.id);
      salarySum = salarySum.plus(totals.fixedSalaryTotal);
      totalSum = totalSum.plus(totals.totalAmount);
    }

    periods.push({
      name: month.name,
      status,
      staffCount: byStaff.size,
      salary: salarySum,
      total: totalSum,
    });
  }

  return periods;
}

function calendarMonthsThrough(fromStr, todayStr) {
  const [fy, fm] = fromStr.split('-').map(Number);
  const [ty, tm] = todayStr.split('-').map(Number);
  const months = [];
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const dim = daysInUtcMonth(dateOnly(`${y}-${String(m).padStart(2, '0')}-01`));
    const mm = String(m).padStart(2, '0');
    months.push({
      start: `${y}-${mm}-01`,
      end: `${y}-${mm}-${String(dim).padStart(2, '0')}`,
      name: `${MONTHS_RU[m - 1]} ${y}`,
    });
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
  return months;
}

function payrollStatus(month, todayStr, lastClosed) {
  if (month.start <= todayStr && todayStr <= month.end) return 'CALCULATED';
  if (lastClosed && month.start === lastClosed.start) return 'APPROVED';
  return 'PAID';
}

function payrollStamps(status, endStr, timezone, now, approver) {
  const at = (dateStr, time) => {
    const stamp = localToUtc(`${dateStr}T${time}:00`, timezone);
    return stamp.getTime() > now.getTime() ? now : stamp;
  };
  const calculatedAt = status === 'CALCULATED' ? now : at(addDaysStr(endStr, 1), '10:00');
  const data = { calculatedAt };
  if (status === 'APPROVED' || status === 'PAID') {
    data.approvedAt = at(addDaysStr(endStr, 1), '16:00');
    data.approvedById = approver.id;
    data.approvedByName = approver.name;
  }
  if (status === 'PAID') {
    data.paidAt = at(addDaysStr(endStr, 3), '12:00');
    data.paidById = approver.id;
    data.paidByName = approver.name;
  }
  return data;
}

async function loadApprover(prisma, businessId) {
  const membership = await prisma.membership.findFirst({
    where: { businessId, role: 'OWNER' },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
  const user = membership?.user;
  if (!user) return { id: null, name: 'Владелец' };
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Владелец';
  return { id: user.id, name };
}

function planOnDate(plans, day) {
  return plans
    .filter((plan) => plan.effectiveFrom <= day && (plan.effectiveTo == null || plan.effectiveTo >= day))
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0];
}

function prorateSalary(plans, dateStrs) {
  let prorated = decimal(0);
  let planId = null;
  let mode = 'GUARANTEED_MINIMUM';
  let lastSalary = decimal(0);
  let daysCovered = 0;

  for (const iso of dateStrs) {
    const day = dateOnly(iso);
    const plan = planOnDate(plans, day);
    if (!plan || plan.fixedSalaryAmount == null) continue;
    prorated = prorated.plus(dailySalaryShare(plan.fixedSalaryAmount, daysInUtcMonth(day)));
    planId = plan.id;
    mode = plan.salaryMode;
    lastSalary = decimal(plan.fixedSalaryAmount);
    daysCovered += 1;
  }

  return { prorated: quantize(prorated), planId, mode, lastSalary, daysCovered };
}

function floorBase(earnings) {
  const reversedIds = new Set(earnings.map((row) => row.reversesEarningId).filter(Boolean));
  return earnings
    .filter((row) => FLOOR_TYPES.has(row.type) && !reversedIds.has(row.id))
    .reduce((acc, row) => acc.plus(decimal(row.amount)), decimal(0));
}

function salaryAmount(proration, workEarnings) {
  if (proration.prorated.lte(0)) return decimal(0);
  if (proration.mode === 'ADDITIVE') return proration.prorated;
  return guaranteedTopUp(proration.prorated, floorBase(workEarnings));
}

function inDateRange(earnedOn, fromStr, toStr) {
  const iso = dateOnlyStr(earnedOn);
  return iso >= fromStr && iso <= toStr;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

function totalsFrom(rows) {
  const fields = {
    fixedSalaryTotal: decimal(0),
    hourlyTotal: decimal(0),
    serviceCommissionTotal: decimal(0),
    productCommissionTotal: decimal(0),
    bonusTotal: decimal(0),
    deductionTotal: decimal(0),
    correctionTotal: decimal(0),
    totalAmount: decimal(0),
    earningsCount: rows.length,
  };
  for (const row of rows) {
    const amount = decimal(row.amount);
    fields.totalAmount = fields.totalAmount.plus(amount);
    const key = EARNING_TOTAL_FIELD[row.type];
    if (!key) throw new Error(`Unhandled earning type: ${row.type}`);
    fields[key] = fields[key].plus(amount);
  }
  return fields;
}

// ─── Summary ────────────────────────────────────────────────────────────────────
function printSummary({ staffList, dateRange, shiftCount, stats, hourlyCount, payroll, clients, currency }) {
  console.log('\n  ── Summary ──');
  console.log(`  Staff: ${staffList.map((s) => s.name).join(', ')}`);
  console.log(`  Clients: ${clients.total} (${clients.bookable.length} in the booking rotation)`);
  console.log(`  Date range: ${dateRange.from} .. ${dateRange.to} (today ${dateRange.todayStr})`);
  console.log(`  Shifts: ${shiftCount}`);
  console.log(`  Bookings: ${stats.total}`);
  for (const [st, n] of Object.entries(stats.byStatus).sort()) console.log(`    ${st.padEnd(10)} ${n}`);
  console.log(`  Commission earnings: ${stats.earnings} (sum ${stats.commissionSum.toFixed(2)} ${currency})`);
  console.log(`  Hourly earnings: ${hourlyCount}`);
  console.log(`  Payroll periods: ${payroll.length}`);
  for (const p of payroll) {
    console.log(`    ${p.name.padEnd(16)} ${p.status.padEnd(12)} salary ${p.salary.toFixed(2)}  total ${p.total.toFixed(2)} ${currency}  (${p.staffCount} staff)`);
  }
}
