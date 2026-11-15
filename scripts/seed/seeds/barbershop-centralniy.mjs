// Demo brand "Барбершоп «Центральный»" (Гомель, ул. Карповича, 35).
// Real business facts come from barbershop-centralniy.data.mjs; clients, bookings, sales,
// inventory and payroll are generated: four months of history plus one month ahead.
// Re-runnable: removes the previous copy of this brand (owned by the seed owner) first.
// Images are uploaded to GCS under brands/<brandId>/files/.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import { Storage } from '@google-cloud/storage';
import { createRng } from '../lib/random.mjs';
import { commission, dailySalaryShare, decimal as D, guaranteedTopUp, quantize } from '../lib/money.mjs';
import {
  addDaysStr, dateOnly, dateOnlyStr, daysInUtcMonth, enumerateDates, hhmmToMinutes, localToUtc,
  minutesToHHmm, parseTimeToDbTime, toZonedParts, zonedDateStr,
} from '../lib/time.mjs';
import {
  ADDONS, BRAND, CANCEL_REASONS, FEMALE_NAMES, INTERNAL_NOTES, LOCATION, MALE_NAMES, NOTES, OPEN, OPEN_DAYS,
  PRODUCTS, PRODUCT_CATEGORIES, REVIEW_REPLIES, REVIEW_TEXTS, SERVICES, SERVICE_CATEGORIES, SERVICE_WEIGHTS,
  STAFF, SURNAMES,
} from './barbershop-centralniy.data.mjs';

export const meta = {
  description: 'Барбершоп «Центральный» (Гомель): бренд, филиал, команда, 4 месяца истории + месяц вперёд',
};

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(here, '..', 'assets', 'barbershop-centralniy');
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const ZERO = D(0);
const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const EARNING_TOTAL_FIELD = {
  FIXED_SALARY: 'fixedSalaryTotal', HOURLY: 'hourlyTotal', SERVICE_COMMISSION: 'serviceCommissionTotal',
  PRODUCT_COMMISSION: 'productCommissionTotal', BONUS: 'bonusTotal', DEDUCTION: 'deductionTotal', CORRECTION: 'correctionTotal',
};
const FLOOR_TYPES = new Set(['SERVICE_COMMISSION', 'PRODUCT_COMMISSION', 'HOURLY']);

const pad = (v, n = 2) => String(v).padStart(n, '0');
const q8 = (v) => D(v).toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
const secs = (d) => new Date(Math.floor(d.getTime() / 1000) * 1000);
const iso = (d) => d.toISOString();
const plus = (d, ms) => new Date(d.getTime() + ms);
const overlaps = (list, s, e) => list.some((i) => s < i.end && e > i.start);
const alignUp = (v, step) => Math.ceil(v / step) * step;
const weekday = (ds) => { const js = new Date(`${ds}T00:00:00Z`).getUTCDay(); return js === 0 ? 7 : js; };
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / DAY);
const monthsBack = (ds, n) => {
  const [y, m, d] = ds.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 - n, 1));
  const dim = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, dim))}`;
};
const monthEnd = (ds) => { const [y, m] = ds.split('-').map(Number); return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const translit = (s) => [...s.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join('');
const femSurname = (s) => {
  if (/(ов|ёв|ев|ин)$/.test(s)) return `${s}а`;
  if (/ский$/.test(s)) return s.replace(/ский$/, 'ская');
  if (/ый$/.test(s)) return s.replace(/ый$/, 'ая');
  return s;
};
const ean13 = (body12) => {
  const sum = [...body12].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return `${body12}${(10 - (sum % 10)) % 10}`;
};

function nextState(st, delta, unitCost, exact) {
  const quantity = st.quantity.plus(delta);
  let totalCost;
  if (exact != null) totalCost = D(exact);
  else if (delta.gte(0)) totalCost = quantize(delta.mul(unitCost));
  else if (quantity.isZero()) totalCost = st.stockValue.neg();
  else totalCost = quantize(st.stockValue.mul(delta.abs()).div(st.quantity)).neg();
  const stockValue = st.stockValue.plus(totalCost);
  const averageUnitCost = quantity.isZero() ? ZERO : q8(stockValue.div(quantity));
  if (quantity.lt(0) || stockValue.lt(0) || (quantity.isZero() && !stockValue.isZero())) {
    throw new Error(`invalid inventory state: qty ${quantity} value ${stockValue}`);
  }
  return { quantity, averageUnitCost, stockValue, totalCost };
}

function allocateCumulative(total, totalQty, qty, allocQty, allocAmt) {
  const target = quantize(total.mul(allocQty.plus(qty)).div(totalQty));
  return Prisma.Decimal.max(0, Prisma.Decimal.min(total.minus(allocAmt), target.minus(allocAmt)));
}

const snap = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v));
const createdChanges = (row, fields) => fields.map((field) => ({ field, from: '—', to: snap(row[field]) ?? '—' }));
const BLOCK_FIELDS = ['staffId', 'title', 'reason', 'notes', 'repeatType', 'startDateTime', 'endDateTime', 'daysMask', 'repeatUntil'];
const blockAudit = (row) => ({
  entityType: row.staffId ? 'STAFF' : 'CALENDAR', entityId: row.staffId ?? row.id, eventType: 'CALENDAR_BLOCK_CREATED', actionType: 'CREATE',
  occurredAt: row.createdAt, payload: { title: row.title ?? 'Блокировка', changes: createdChanges(row, BLOCK_FIELDS) },
});

const docSnapshot = (doc) => {
  const src = {
    ...doc,
    items: doc.items.map((it) => ({
      productId: it.productId, productName: it.productName, productUnit: it.productUnit, quantity: D(it.quantity).toString(),
      unitCost: it.unitCost?.toString() ?? null, totalCost: it.totalCost?.toString() ?? null, packagingName: it.packagingName,
      packagingFactor: it.packagingFactor?.toString() ?? null, packageQuantity: it.packageQuantity?.toString() ?? null,
      packageUnitCost: it.packageUnitCost?.toString() ?? null,
    })),
  };
  return Object.fromEntries(['type', 'destinationLocationId', 'supplierId', 'supplierName', 'occurredAt', 'reference', 'reason', 'note', 'items']
    .map((k) => {
      const v = src[k];
      return [k, v == null ? null : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v)];
    }));
};

export async function seed(prisma) {
  const rng = createRng(1526001);
  const now = new Date();
  const tz = LOCATION.timezone;
  const currency = LOCATION.currency;
  const slot = LOCATION.slotIntervalMinutes;
  const at = (ds, minutes) => localToUtc(`${ds}T${minutesToHHmm(minutes)}:00`, tz);
  const atHm = (ds, hm) => at(ds, hhmmToMinutes(hm));
  const todayStr = zonedDateStr(now, tz);

  const HISTORY_FROM = monthsBack(todayStr, 4);
  const FUTURE_TO = addDaysStr(todayStr, 30);
  const SHIFTS_TO = monthEnd(FUTURE_TO);
  const OPEN_DAY = addDaysStr(HISTORY_FROM, -7);
  const BRAND_AT = atHm(OPEN_DAY, '11:00');
  const CATALOG_AT = atHm(addDaysStr(HISTORY_FROM, -6), '12:00');
  const PAGE_CREATED_AT = atHm(addDaysStr(HISTORY_FROM, -5), '12:00');
  const PUBLISHED_AT = atHm(addDaysStr(HISTORY_FROM, -3), '18:00');
  const BOOKINGS_OPEN_AT = atHm(addDaysStr(HISTORY_FROM, -5), '10:00');

  // ─── Owner + cleanup ─────────────────────────────────────────────────────────
  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'pavelnagorsky047@gmail.com';
  const ownerUser = await prisma.user.findFirst({ where: { email: ownerEmail } });
  if (!ownerUser) throw new Error(`Owner ${ownerEmail} not found`);
  const owner = { id: ownerUser.id, name: [ownerUser.firstName, ownerUser.lastName].filter(Boolean).join(' ') || ownerEmail };
  const ownerActor = { actorId: owner.id, actorName: owner.name, actorRole: 'OWNER' };
  const systemActor = { actorId: null, actorName: 'System', actorRole: 'SYSTEM' };

  const bucketName = process.env.GOOGLE_BUCKET_NAME;
  if (!bucketName) throw new Error('GOOGLE_BUCKET_NAME is not set');
  const bucket = new Storage({ projectId: process.env.GOOGLE_PROJECT_ID }).bucket(bucketName);

  // ─── Brand, location, files ──────────────────────────────────────────────────
  const brandId = randomUUID();
  const locationId = randomUUID();
  const audit = [];
  const addAudit = (row) => audit.push({ id: randomUUID(), brandId, locationId, ...row });

  const files = [];
  const fileFor = (relPath, createdAt) => {
    const buf = readFileSync(resolve(ASSETS, relPath));
    const ext = relPath.split('.').pop();
    const id = randomUUID();
    const storageKey = `brands/${brandId}/files/${id}.${ext}`;
    files.push({
      buf,
      row: {
        id, userId: owner.id, url: `https://storage.googleapis.com/${bucketName}/${storageKey}`, storageKey,
        fileName: relPath.split('/').pop(), mimeType: ext === 'png' ? 'image/png' : 'image/jpeg', fileSizeBytes: buf.length, createdAt,
      },
    });
    return id;
  };

  const brand = { id: brandId, name: BRAND.name, logoFileId: fileFor('logo.jpg', BRAND_AT), createdAt: BRAND_AT, updatedAt: BRAND_AT };
  const { coordinates, ...locationFields } = LOCATION;
  const location = {
    id: locationId, brandId, ...locationFields,
    mapWidgetUrl: `https://yandex.ru/map-widget/v1/?ll=${coordinates.lon}%2C${coordinates.lat}&z=17&pt=${coordinates.lon}%2C${coordinates.lat}%2Cpm2blm`,
    bookingVisibility: 'PUBLIC', isBookingConfirmationRequired: false, reviewsEnabled: true, notifyClientOnStaffChanges: true,
    createdAt: plus(BRAND_AT, 2 * MIN), updatedAt: plus(BRAND_AT, 2 * MIN),
  };
  addAudit({ locationId: null, entityType: 'BRAND', entityId: brandId, eventType: 'BRAND_CREATED', actionType: 'CREATE', occurredAt: BRAND_AT, ...ownerActor, payload: { name: brand.name } });
  addAudit({ entityType: 'LOCATION', entityId: locationId, eventType: 'LOCATION_CREATED', actionType: 'CREATE', occurredAt: location.createdAt, ...ownerActor, payload: { name: location.name } });

  // ─── Services ────────────────────────────────────────────────────────────────
  const categoryRows = SERVICE_CATEGORIES.map((c, i) => ({
    id: randomUUID(), locationId, name: c.name, description: c.description, sortOrder: c.sortOrder, createdAt: plus(BRAND_AT, (5 + i) * MIN),
  }));
  const categoryByName = new Map(categoryRows.map((c) => [c.name, c]));
  for (const c of categoryRows) addAudit({ entityType: 'SERVICE', entityId: c.id, eventType: 'SERVICE_CATEGORY_CREATED', actionType: 'CREATE', occurredAt: c.createdAt, ...ownerActor, payload: { name: c.name } });
  const sortInCategory = new Map();
  const services = SERVICES.map((s, i) => {
    const order = sortInCategory.get(s.category) ?? 0;
    sortInCategory.set(s.category, order + 1);
    const createdAt = plus(BRAND_AT, (10 + i) * MIN);
    return {
      key: s.key,
      row: {
        id: randomUUID(), locationId, categoryId: categoryByName.get(s.category).id, imageFileId: s.image ? fileFor(s.image, createdAt) : null,
        title: s.title, description: s.description, price: D(s.price), durationMinutes: s.duration, bufferMinutes: s.duration >= 30 ? 5 : 0,
        status: 'ACTIVE', sortOrder: order, createdAt, updatedAt: createdAt,
      },
    };
  });
  const serviceByKey = new Map(services.map((s) => [s.key, s.row]));
  const serviceKeyById = new Map(services.map((s) => [s.row.id, s.key]));
  for (const { row } of services) addAudit({
    entityType: 'SERVICE', entityId: row.id, eventType: 'SERVICE_CREATED', actionType: 'CREATE', occurredAt: row.createdAt, ...ownerActor,
    payload: { price: row.price.toFixed(2), title: row.title, currency, categoryName: SERVICES.find((s) => s.title === row.title).category, durationMinutes: row.durationMinutes },
  });

  // ─── Staff, plans, shifts, blocks ────────────────────────────────────────────
  const staffRows = [];
  const staffServiceRows = [];
  const planRows = [];
  const shiftRows = [];
  const blockRows = [];
  const staff = STAFF.map((s, i) => {
    const createdAt = s.activeFrom ? atHm(addDaysStr(s.activeFrom, -5), '12:00') : plus(BRAND_AT, (25 + i * 3) * MIN);
    const row = {
      id: randomUUID(), locationId, userId: null, avatarFileId: fileFor(s.avatar, createdAt), name: s.name, phone: null, email: null,
      roleTitle: s.roleTitle, description: s.description, status: 'ACTIVE', employmentType: s.employmentType, taxId: null,
      employeeNumber: pad(i + 1, 3), payoutMethod: s.payoutMethod, payoutNote: null, createdAt, updatedAt: createdAt,
    };
    staffRows.push(row);
    const keys = s.services === 'all' ? SERVICES.map((x) => x.key) : s.services;
    for (const k of keys) staffServiceRows.push({ staffId: row.id, serviceId: serviceByKey.get(k).id });
    const effectiveFrom = s.activeFrom ?? OPEN_DAY;
    const plan = {
      id: randomUUID(), locationId, staffId: row.id, effectiveFrom: dateOnly(effectiveFrom), effectiveTo: null,
      fixedSalaryAmount: s.plan.fixedSalaryAmount ? D(s.plan.fixedSalaryAmount) : null, hourlyRate: null,
      serviceCommissionPercent: D(s.plan.serviceCommissionPercent), productCommissionPercent: D(s.plan.productCommissionPercent),
      salaryMode: s.plan.salaryMode, note: s.plan.salaryMode === 'GUARANTEED_MINIMUM' ? 'Гарантированный минимум на период адаптации' : null,
      createdAt: plus(createdAt, 5 * MIN),
    };
    planRows.push(plan);
    addAudit({ entityType: 'STAFF', entityId: row.id, eventType: 'STAFF_CREATED', actionType: 'CREATE', occurredAt: createdAt, ...ownerActor, payload: { name: row.name } });
    addAudit({
      entityType: 'STAFF', entityId: row.id, eventType: 'STAFF_COMPENSATION_UPDATED', actionType: 'MODIFY', occurredAt: plan.createdAt, ...ownerActor,
      payload: {
        effectiveFrom, serviceCommissionPercent: plan.serviceCommissionPercent.toFixed(2), productCommissionPercent: plan.productCommissionPercent.toFixed(2),
        fixedSalaryAmount: plan.fixedSalaryAmount?.toFixed(2) ?? null, hourlyRate: null,
      },
    });
    return { ...s, row, plan, serviceKeys: keys, shifts: new Map() };
  });
  const staffByKey = new Map(staff.map((s) => [s.key, s]));

  const vacation = { from: addDaysStr(HISTORY_FROM, 34), to: addDaysStr(HISTORY_FROM, 43) };
  for (const s of staff) {
    const from = s.activeFrom ?? HISTORY_FROM;
    for (const ds of enumerateDates(from, SHIFTS_TO)) {
      const wd = weekday(ds);
      if (!OPEN_DAYS.includes(wd)) continue;
      let works;
      if (s.schedule.rotation) {
        const r = s.schedule.rotation;
        const idx = ((daysBetween(r.anchor, ds) % (r.on + r.off)) + r.on + r.off) % (r.on + r.off);
        works = idx < r.on && !(s.key === 'vlad' && ds >= vacation.from && ds <= vacation.to);
      } else works = s.schedule.days.includes(wd);
      if (!works) continue;
      const [start, end] = s.schedule.hours?.[wd] ?? s.schedule.default;
      s.shifts.set(ds, { start: hhmmToMinutes(start), end: hhmmToMinutes(end) });
      shiftRows.push({ id: randomUUID(), staffId: s.row.id, date: dateOnly(ds), startTime: parseTimeToDbTime(start), endTime: parseTimeToDbTime(end), createdAt: plus(s.row.createdAt, 10 * MIN), updatedAt: plus(s.row.createdAt, 10 * MIN) });
    }
    addAudit({ entityType: 'STAFF', entityId: s.row.id, eventType: 'STAFF_SHIFTS_UPDATED', actionType: 'MODIFY', occurredAt: plus(s.row.createdAt, 10 * MIN), ...ownerActor, payload: { startDate: from, endDate: SHIFTS_TO } });

    const firstShift = [...s.shifts.keys()][0];
    const days = s.schedule.days ?? OPEN_DAYS;
    const daysMask = [1, 2, 3, 4, 5, 6, 7].map((d) => (days.includes(d) ? '1' : '0')).join('');
    const lunchAt = plus(s.row.createdAt, 12 * MIN);
    const lunch = {
      id: randomUUID(), locationId, staffId: s.row.id, type: 'BLOCK', reason: null, title: 'Обед', notes: null, repeatType: 'WEEKLY',
      startDateTime: atHm(firstShift, s.lunch.start), endDateTime: atHm(firstShift, s.lunch.end), daysMask, repeatUntil: dateOnly(SHIFTS_TO),
      createdAt: lunchAt, updatedAt: lunchAt,
    };
    blockRows.push(lunch);
    s.lunchDays = new Set(days);
    addAudit({ ...blockAudit(lunch), ...ownerActor });
  }

  // Busy intervals (minutes of day) per staff/day: lunch, one-off blocks, then bookings.
  const busyMap = new Map();
  const busy = (s, ds) => {
    const k = `${s.key}|${ds}`;
    if (!busyMap.has(k)) busyMap.set(k, s.lunchDays.has(weekday(ds)) ? [{ start: hhmmToMinutes(s.lunch.start), end: hhmmToMinutes(s.lunch.end) }] : []);
    return busyMap.get(k);
  };
  const oneOff = [
    ['david', addDaysStr(HISTORY_FROM, 62), '10:00', '14:00', 'Семинар', 'Семинар по фейдам и текстурным стрижкам', 14],
    ['vlad', addDaysStr(todayStr, 9), '10:00', '12:00', 'Личное', null, 3],
    ['david', addDaysStr(todayStr, 23), '18:00', '21:00', 'Фотосессия', 'Съёмка работ для Instagram', 2],
  ];
  for (const [key, target, from, to, title, reason, daysBefore] of oneOff) {
    const s = staffByKey.get(key);
    const ds = [...s.shifts.keys()].find((d) => d >= target);
    if (!ds) continue;
    const sh = s.shifts.get(ds);
    const st = Math.max(hhmmToMinutes(from), sh.start);
    const en = Math.min(hhmmToMinutes(to), sh.end);
    const createdAt = secs(new Date(Math.min(at(ds, st).getTime() - daysBefore * DAY, now.getTime() - 2 * HOUR)));
    const row = {
      id: randomUUID(), locationId, staffId: s.row.id, type: 'BLOCK', reason, title, notes: null, repeatType: 'NONE',
      startDateTime: at(ds, st), endDateTime: at(ds, en), daysMask: null, repeatUntil: null, createdAt, updatedAt: createdAt,
    };
    blockRows.push(row);
    busy(s, ds).push({ start: st, end: en });
    addAudit({ ...blockAudit(row), ...ownerActor });
  }

  // ─── Catalog: suppliers, products ────────────────────────────────────────────
  const suppliers = [
    { name: 'Барбер Опт', legalName: 'ООО «Барбер Опт»', taxId: '491384726', phone: '+375232298410', email: 'order@barber-opt.example.com', contactPerson: 'Ирина Шевчук', notes: 'Косметика под нашей маркой. Поставка по вторникам, оплата по факту.' },
    { name: 'Литвинов А. С.', legalName: 'ИП Литвинов Андрей Сергеевич', taxId: '491902355', phone: '+375296612087', email: null, contactPerson: 'Андрей Литвинов', notes: 'Гребни и станки, доставка по Гомелю.' },
  ].map((s, i) => ({
    id: randomUUID(), brandId, ...s, normalizedName: s.name.trim().replace(/\s+/g, ' ').toLowerCase(), isActive: true,
    createdAt: plus(CATALOG_AT, i * 3 * MIN), updatedAt: plus(CATALOG_AT, i * 3 * MIN),
  }));
  for (const s of suppliers) addAudit({ locationId: null, entityType: 'SUPPLIER', entityId: s.id, eventType: 'SUPPLIER_CREATED', actionType: 'CREATE', occurredAt: s.createdAt, ...ownerActor, payload: { name: s.name } });
  const supplierFor = (p) => (p.category === 'Аксессуары' ? suppliers[1] : suppliers[0]);

  const productCategoryRows = PRODUCT_CATEGORIES.map((c, i) => ({
    id: randomUUID(), brandId, name: c.name, description: c.description, sortOrder: c.sortOrder, createdAt: plus(CATALOG_AT, (10 + i) * MIN), updatedAt: plus(CATALOG_AT, (10 + i) * MIN),
  }));
  const productCategoryByName = new Map(productCategoryRows.map((c) => [c.name, c]));
  for (const c of productCategoryRows) addAudit({ locationId: null, entityType: 'PRODUCT', entityId: c.id, eventType: 'PRODUCT_CATEGORY_CREATED', actionType: 'CREATE', occurredAt: c.createdAt, ...ownerActor, payload: { name: c.name, description: c.description } });

  const productRows = [];
  const packagingRows = [];
  const plRows = [];
  const products = PRODUCTS.map((p, i) => {
    const createdAt = plus(CATALOG_AT, (20 + i * 2) * MIN);
    const row = {
      id: randomUUID(), brandId, categoryId: productCategoryByName.get(p.category).id, imageFileId: fileFor(`products/${p.image}`, createdAt),
      name: p.name, description: p.description, sku: p.sku, barcode: ean13(`4810526${pad(1001 + i, 5)}`), unit: 'PIECE', status: 'ACTIVE', createdAt, updatedAt: createdAt,
    };
    const pkg = { id: randomUUID(), productId: row.id, name: 'Коробка', quantityInBaseUnit: D(p.box), isActive: true, createdAt: plus(createdAt, MIN), updatedAt: plus(createdAt, MIN) };
    const pl = {
      id: randomUUID(), productId: row.id, locationId, retailPrice: D(p.retailPrice), status: 'ACTIVE', trackInventory: true,
      reorderLevel: D(p.sku === 'CG-RAZOR-T' ? 1 : 3), createdAt: plus(createdAt, MIN), updatedAt: plus(createdAt, MIN),
    };
    productRows.push(row);
    packagingRows.push(pkg);
    plRows.push(pl);
    addAudit({ locationId: null, entityType: 'PRODUCT', entityId: row.id, eventType: 'PRODUCT_CREATED', actionType: 'CREATE', occurredAt: createdAt, ...ownerActor, payload: { name: row.name, sku: row.sku, barcode: row.barcode, unit: 'PIECE' } });
    addAudit({ locationId: null, entityType: 'PRODUCT', entityId: row.id, eventType: 'PRODUCT_PACKAGING_CREATED', actionType: 'CREATE', occurredAt: pkg.createdAt, ...ownerActor, payload: { packagingId: pkg.id, name: pkg.name, quantityInBaseUnit: pkg.quantityInBaseUnit.toString(), isActive: true } });
    return { ...p, row, pkg, pl };
  });
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const productByPl = new Map(products.map((p) => [p.pl.id, p]));

  // ─── Booking channels ────────────────────────────────────────────────────────
  const page = {
    id: randomUUID(), locationId, title: 'Основная страница записи', heading: 'Барбершоп «Центральный»', slug: 'centralniy-gomel', status: 'PUBLISHED',
    tagline: 'Мужские стрижки и борода в центре Гомеля',
    html: [
      '<h2>Барбершоп «Центральный»</h2>',
      '<p>Мужские стрижки, оформление бороды и камуфляж седины в самом центре Гомеля. Работаем машинкой и ножницами, подбираем форму под тип волос и лица, а в конце — горячее полотенце и укладка.</p>',
      '<h3>Где мы находимся</h3>',
      '<p>Гомель, ул. Карповича, 35</p>',
      '<h3>Режим работы</h3>',
      '<p>Вторник – воскресенье: 10:00–21:00<br>Понедельник — выходной</p>',
      '<h3>Контакты</h3>',
      '<p>Телефон и запись: <a href="tel:+375333331844">+375 (33) 333-18-44</a><br>Instagram: <a href="https://www.instagram.com/barbershop_centralniy/" target="_blank" rel="noopener">@barbershop_centralniy</a></p>',
    ].join('\n'),
    metaTitle: 'Барбершоп «Центральный» — онлайн-запись, Гомель',
    metaDescription: 'Мужские стрижки, оформление бороды и камуфляж седины в центре Гомеля. Ул. Карповича, 35. Вт–Вс 10:00–21:00. Запишитесь онлайн.',
    gtmId: null, yandexMetrikaId: null, coverFileId: fileFor('cover.jpg', PAGE_CREATED_AT), palette: 'OBSIDIAN',
    customBackground: null, customSurface: null, customText: null, customMuted: null, customAccent: null, customAccentText: null,
    headline: 'Онлайн-запись', caption: 'Выберите услугу, барбера и удобное время', showStaff: true, showBranding: true,
    publishedAt: PUBLISHED_AT, createdAt: PAGE_CREATED_AT, updatedAt: PUBLISHED_AT,
  };
  const widgetTitle = 'Кнопка «Записаться»';
  const widget = {
    id: randomUUID(), locationId, title: widgetTitle, titleKey: widgetTitle.trim().toLowerCase(), status: 'PUBLISHED', placement: 'DIALOG',
    trigger: 'FLOATING_BUTTON', buttonPosition: 'BOTTOM_RIGHT',
    buttonAppearance: { text: 'Записаться', variant: 'SOLID', format: 'ICON_TEXT', size: 'MEDIUM', radius: 'PILL', icon: 'CALENDAR', color: '#151515', textColor: '#FFFFFF', shadow: true, fullWidth: false, mobileIconOnly: true, offset: 24 },
    gtmId: null, yandexMetrikaId: null, palette: 'MONO',
    customBackground: null, customSurface: null, customText: null, customMuted: null, customAccent: null, customAccentText: null,
    headline: 'Запись в «Центральный»', caption: 'Стрижка и борода в центре Гомеля', showStaff: true, showBranding: true,
    publishedAt: plus(PUBLISHED_AT, 20 * MIN), createdAt: plus(PUBLISHED_AT, -40 * MIN), updatedAt: plus(PUBLISHED_AT, 20 * MIN),
  };
  addAudit({ entityType: 'BOOKING_PAGE', entityId: page.id, eventType: 'BOOKING_PAGE_CREATED', actionType: 'CREATE', occurredAt: page.createdAt, ...ownerActor, payload: { title: page.title } });
  addAudit({ entityType: 'BOOKING_PAGE', entityId: page.id, eventType: 'BOOKING_PAGE_STATUS_CHANGED', actionType: 'MODIFY', occurredAt: page.publishedAt, ...ownerActor, payload: { title: page.title, changes: [{ field: 'status', from: 'DRAFT', to: 'PUBLISHED' }] } });
  addAudit({ entityType: 'BOOKING_WIDGET', entityId: widget.id, eventType: 'BOOKING_WIDGET_CREATED', actionType: 'CREATE', occurredAt: widget.createdAt, ...ownerActor, payload: { title: widget.title } });
  addAudit({ entityType: 'BOOKING_WIDGET', entityId: widget.id, eventType: 'BOOKING_WIDGET_STATUS_CHANGED', actionType: 'MODIFY', occurredAt: widget.publishedAt, ...ownerActor, payload: { title: widget.title, changes: [{ field: 'status', from: 'DRAFT', to: 'PUBLISHED' }] } });

  // ─── Clients ─────────────────────────────────────────────────────────────────
  const phones = new Set();
  const clients = [];
  for (let i = 0; i < 420; i++) {
    const female = rng.chance(0.07);
    const firstName = rng.pick(female ? FEMALE_NAMES : MALE_NAMES);
    const surname = rng.pick(SURNAMES);
    const lastName = female ? femSurname(surname) : surname;
    let phone;
    do phone = `+375${rng.weighted([['29', 45], ['33', 30], ['44', 20], ['25', 5]])}${rng.int(2000000, 9999999)}`; while (phones.has(phone));
    phones.add(phone);
    const email = rng.chance(0.45) ? `${translit(firstName)}.${translit(lastName)}${rng.chance(0.5) ? rng.int(1, 99) : ''}@example.com` : null;
    const birthDate = rng.chance(0.3) ? dateOnly(`${rng.int(1966, 2008)}-${pad(rng.int(1, 12))}-${pad(rng.int(1, 28))}`) : null;
    clients.push({
      id: randomUUID(), brandId, firstName, lastName, phone, email: email && !clients.some((c) => c.email === email) ? email : null, birthDate,
      gender: female ? 'FEMALE' : 'MALE', notes: rng.chance(0.04) ? rng.pick(INTERNAL_NOTES) : null,
      firstSeen: null, fav: null, regular: false,
    });
  }
  for (const c of clients) {
    if (c.gender !== 'MALE' || !rng.chance(0.38)) continue;
    c.regular = true;
    c.fav = rng.weighted([['david', 50], ['vlad', 38], ['artur', 12]]);
  }
  const regularsBy = new Map(STAFF.map((s) => [s.key, clients.filter((c) => c.fav === s.key)]));
  const pickClient = (s, ds, usedToday) => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const pool = rng.chance(0.55) && regularsBy.get(s.key).length ? regularsBy.get(s.key) : clients;
      const c = rng.pick(pool);
      if (s.key === 'artur' && c.fav === 'artur' && ds < s.activeFrom) continue;
      if (!usedToday.has(c.id)) { usedToday.add(c.id); return c; }
    }
    return rng.pick(clients);
  };
  const seen = (c, t) => { if (!c.firstSeen || t < c.firstSeen) c.firstSeen = t; };

  // ─── Bookings, orders, earnings ──────────────────────────────────────────────
  const out = { calendarEvents: [], bookings: [], bookingItems: [], orders: [], orderItems: [], earnings: [], reviews: [], reviewStaff: [] };
  const saleLines = [];
  const stats = {};
  const bump = (k) => { stats[k] = (stats[k] ?? 0) + 1; };
  const clientActor = (b) => ({ actorId: b.clientId, actorName: `${b.clientFirstName} ${b.clientLastName}`.trim(), actorRole: 'CLIENT' });

  const BEARD_KEYS = new Set(['beard', 'beard-camo-grey', 'beard-camo', 'haircut-beard']);
  const pickProduct = (serviceKey) => rng.weighted(products.map((p) => {
    let w = p.weight;
    if (BEARD_KEYS.has(serviceKey) && p.category === 'Уход за бородой') w *= 2.5;
    if (!BEARD_KEYS.has(serviceKey) && p.category === 'Стайлинг') w *= 1.6;
    return [p, w];
  }));
  let forcedPair = false;

  const productItem = (orderId, s, product, qty, occurredAt) => {
    const price = product.pl.retailPrice;
    const line = price.mul(qty);
    const item = {
      id: randomUUID(), orderId, type: 'PRODUCT', status: 'CONFIRMED', catalogItemId: product.row.id, categoryId: product.row.categoryId,
      productLocationId: product.pl.id, title: product.name, sku: product.sku, unit: 'PIECE', quantity: D(qty), listUnitPrice: price,
      customUnitPrice: null, unitPrice: price, lineSubtotal: line, discountTotal: ZERO, lineTotal: line, sellerStaffId: s.row.id, sellerName: s.name,
      confirmedAt: occurredAt, occurredAt, createdAt: occurredAt,
    };
    saleLines.push({ orderId, orderItemId: item.id, plId: product.pl.id, qty: D(qty), at: occurredAt });
    out.earnings.push({
      id: randomUUID(), locationId, staffId: s.row.id, type: 'PRODUCT_COMMISSION', source: 'PRODUCT_SALE', earnedOn: dateOnly(zonedDateStr(occurredAt, tz)),
      amount: commission(line, s.plan.productCommissionPercent), currency, baseAmount: line, ratePercent: s.plan.productCommissionPercent,
      description: product.name, idempotencyKey: `order-item:${item.id}:PRODUCT_COMMISSION`, compensationPlanId: s.plan.id, orderId, orderItemId: item.id,
      createdAt: plus(occurredAt, MIN),
    });
    return item;
  };

  function placeBooking(s, svcList, client, ds, startMin) {
    const parts = [];
    let cursor = startMin;
    for (const svc of svcList) { parts.push({ svc, start: cursor, end: cursor + svc.durationMinutes }); cursor += svc.durationMinutes; }
    const startAt = at(ds, startMin);
    const endAt = at(ds, cursor);
    const past = endAt <= now;
    const status = past ? rng.weighted([['COMPLETED', 84], ['CANCELLED', 10], ['NO_SHOW', 6]]) : rng.weighted([['CONFIRMED', 96], ['CANCELLED', 4]]);
    const leadDays = rng.weighted([[[0, 1], 18], [[1, 3], 32], [[3, 7], 30], [[7, 18], 20]]);
    let createdAt = new Date(startAt.getTime() - (leadDays[0] * 24 + rng.int(2, (leadDays[1] - leadDays[0]) * 24)) * HOUR - rng.int(0, 59) * MIN);
    if (createdAt > now) createdAt = new Date(now.getTime() - rng.int(15, 60 * 24 * 6) * MIN);
    if (createdAt < BOOKINGS_OPEN_AT) createdAt = new Date(BOOKINGS_OPEN_AT.getTime() + rng.int(0, Math.max(1, Math.floor((Math.min(startAt, now) - BOOKINGS_OPEN_AT) / MIN) - 180)) * MIN);
    if (createdAt >= startAt) createdAt = new Date(startAt.getTime() - rng.int(3, 20) * HOUR);
    createdAt = secs(createdAt);
    const source = createdAt < PUBLISHED_AT ? 'MANUAL' : rng.weighted([['PUBLIC_PAGE', 40], ['WIDGET', 15], ['MANUAL', 45]]);
    const lead = startAt - createdAt;
    const due = lead > 24 * HOUR ? new Date(startAt - 24 * HOUR) : lead > 6 * HOUR ? new Date(startAt - 2 * HOUR) : null;
    // Emails only on bookings of elapsed days: nothing for the stage crons to send.
    const email = ds < todayStr ? client.email : null;
    const isCancelled = status === 'CANCELLED';
    let cancelledAt = null;
    if (isCancelled) {
      const latest = Math.min(startAt.getTime() - HOUR, now.getTime() - 10 * MIN);
      const earliest = createdAt.getTime() + 30 * MIN;
      cancelledAt = secs(new Date(latest <= earliest ? earliest : earliest + rng.float() * (latest - earliest)));
      if (cancelledAt > now) cancelledAt = secs(new Date(now.getTime() - 5 * MIN));
    }
    let reminderDueAt = null;
    let reminderSentAt = null;
    if (past && due) {
      if (isCancelled) { if (email && cancelledAt > due) reminderSentAt = new Date(due.getTime() + 4); }
      else if (email) reminderSentAt = new Date(due.getTime() + 4);
      else reminderDueAt = due;
    }
    const cancelledBy = isCancelled ? (rng.chance(0.65) ? 'CLIENT' : 'STAFF') : null;
    const bookingId = randomUUID();
    const completedAt = new Date(endAt.getTime() + rng.int(1, 9) * MIN + rng.int(0, 59) * 1000);
    const booking = {
      id: bookingId, locationId, clientId: client.id, startAt, endAt, executionMode: 'SEQUENTIAL', status, source, isCustomTime: false,
      bookingPageId: source === 'PUBLIC_PAGE' ? page.id : null, bookingWidgetId: source === 'WIDGET' ? widget.id : null,
      clientFirstName: client.firstName, clientLastName: client.lastName, clientPhone: client.phone, clientEmail: email,
      notes: source !== 'MANUAL' && rng.chance(0.2) ? rng.pick(NOTES) : null, internalNotes: rng.chance(0.1) ? rng.pick(INTERNAL_NOTES) : null,
      cancellationReason: isCancelled ? rng.pick(CANCEL_REASONS) : null, cancelledBy, cancelledAt,
      reminderDueAt, reminderSentAt, reviewRequestSentAt: null, createdAt,
      updatedAt: isCancelled ? cancelledAt : status === 'COMPLETED' ? completedAt : status === 'NO_SHOW' ? plus(endAt, 25 * MIN) : createdAt,
    };
    if (status === 'COMPLETED' && email) booking.reviewRequestSentAt = new Date(endAt.getTime() + 2 * HOUR + rng.int(1, 9) * MIN);
    out.bookings.push(booking);
    seen(client, createdAt);

    const customMain = rng.chance(0.06);
    const items = parts.map((p, i) => {
      const customPrice = i === 0 && customMain ? quantize(p.svc.price.mul(0.9)) : null;
      const calendarEventId = isCancelled ? null : randomUUID();
      const itStart = at(ds, p.start);
      const itEnd = at(ds, p.end);
      if (calendarEventId) out.calendarEvents.push({
        id: calendarEventId, locationId, staffId: s.row.id, type: 'BOOKING', repeatType: 'NONE', startDateTime: itStart, endDateTime: itEnd, createdAt, updatedAt: createdAt,
      });
      const item = {
        id: randomUUID(), bookingId, locationId, serviceId: p.svc.id, staffId: s.row.id, sortOrder: i, startAt: itStart, endAt: itEnd,
        serviceTitle: p.svc.title, serviceDuration: p.svc.durationMinutes, listPrice: p.svc.price, chargedPrice: p.svc.price, customPrice,
        staffName: s.name, calendarEventId,
      };
      out.bookingItems.push(item);
      return item;
    });
    bump(`${past ? 'past' : 'future'}:${status}`);
    bump(`source:${source}`);

    const priceOf = (it) => D(it.customPrice ?? it.listPrice);
    const total = items.reduce((a, it) => a.plus(priceOf(it)), ZERO);
    addAudit({
      entityType: 'BOOKING', entityId: bookingId, eventType: 'BOOKING_CREATED', actionType: 'CREATE', occurredAt: createdAt,
      ...(source === 'MANUAL' ? ownerActor : clientActor(booking)),
      payload: {
        items: items.map((it) => ({ price: priceOf(it).toFixed(2), staffName: s.name, serviceName: it.serviceTitle })), source,
        endTime: iso(endAt), currency, startTime: iso(startAt), totalPrice: total.toFixed(2), isCustomTime: false, executionMode: 'SEQUENTIAL',
      },
    });
    if (isCancelled) addAudit({
      entityType: 'BOOKING', entityId: bookingId, eventType: 'BOOKING_CANCELLED', actionType: 'MODIFY', occurredAt: cancelledAt,
      ...(cancelledBy === 'CLIENT' ? clientActor(booking) : ownerActor), payload: { cancelledBy, reason: booking.cancellationReason, removedDraftProductItems: [] },
    });
    if (status === 'NO_SHOW') addAudit({
      entityType: 'BOOKING', entityId: bookingId, eventType: 'BOOKING_STATUS_CHANGED', actionType: 'MODIFY', occurredAt: booking.updatedAt, ...ownerActor, payload: { to: 'NO_SHOW', from: 'CONFIRMED' },
    });
    if (status !== 'COMPLETED') return booking;

    addAudit({ entityType: 'BOOKING', entityId: bookingId, eventType: 'BOOKING_STATUS_CHANGED', actionType: 'MODIFY', occurredAt: completedAt, ...systemActor, payload: { to: 'COMPLETED', from: 'CONFIRMED' } });
    const orderId = randomUUID();
    const orderItems = items.map((it) => ({
      id: randomUUID(), orderId, type: 'SERVICE', bookingItemId: it.id, status: 'CONFIRMED', catalogItemId: it.serviceId,
      categoryId: services.find((x) => x.row.id === it.serviceId).row.categoryId, title: it.serviceTitle, quantity: D(1), listUnitPrice: it.listPrice,
      customUnitPrice: it.customPrice, unitPrice: priceOf(it), lineSubtotal: priceOf(it), discountTotal: ZERO, lineTotal: priceOf(it),
      sellerStaffId: s.row.id, sellerName: s.name, confirmedAt: endAt, occurredAt: endAt, createdAt: completedAt,
    }));
    items.forEach((it, i) => out.earnings.push({
      id: randomUUID(), locationId, staffId: s.row.id, type: 'SERVICE_COMMISSION', source: 'BOOKING', earnedOn: dateOnly(ds),
      amount: commission(priceOf(it), s.plan.serviceCommissionPercent), currency, baseAmount: priceOf(it), ratePercent: s.plan.serviceCommissionPercent,
      description: it.serviceTitle, idempotencyKey: `booking-item:${it.id}:SERVICE_COMMISSION`, compensationPlanId: s.plan.id,
      bookingId, bookingItemId: it.id, orderId, orderItemId: orderItems[i].id, createdAt: completedAt,
    }));
    if (rng.chance(0.14)) {
      let qty = rng.chance(0.08) ? 2 : 1;
      if (!forcedPair && ds.slice(0, 7) === monthsBack(todayStr, 1).slice(0, 7) && Number(ds.slice(8)) <= 15) { qty = 2; forcedPair = true; }
      orderItems.push(productItem(orderId, s, pickProduct(serviceKeyById.get(items[0].serviceId)), qty, endAt));
      bump('upsell');
    }
    const list = orderItems.reduce((a, i) => a.plus(D(i.listUnitPrice).mul(i.quantity)), ZERO);
    const sum = orderItems.reduce((a, i) => a.plus(i.lineTotal), ZERO);
    out.orders.push({
      id: orderId, locationId, bookingId, clientId: client.id, clientName: `${client.firstName} ${client.lastName}`, clientPhone: client.phone,
      currency, status: 'ACTIVE', version: 1, occurredAt: endAt, listTotalAmount: list, subtotalAmount: sum, discountTotal: ZERO, totalAmount: sum,
      createdById: null, createdByName: 'System', createdAt: completedAt, updatedAt: completedAt,
    });
    out.orderItems.push(...orderItems);
    return booking;
  }

  const BASE_PER_DAY = { 2: 6, 3: 6, 4: 7, 5: 8, 6: 9, 7: 6 };
  const bookable = (s) => s.serviceKeys.map((k) => serviceByKey.get(k));
  for (const ds of enumerateDates(HISTORY_FROM, FUTURE_TO)) {
    const working = staff.filter((s) => s.shifts.has(ds));
    if (!working.length) continue;
    const usedToday = new Set();
    const ahead = daysBetween(todayStr, ds);
    const future = ahead <= 0 ? 1 : ahead <= 7 ? 0.85 : ahead <= 14 ? 0.65 : ahead <= 21 ? 0.45 : 0.3;
    for (const s of working) {
      const sh = s.shifts.get(ds);
      const sinceOpen = daysBetween(HISTORY_FROM, ds);
      let ramp = sinceOpen < 21 ? 0.85 : 1;
      if (s.activeFrom && daysBetween(s.activeFrom, ds) < 21) ramp = 0.6;
      const target = Math.max(1, Math.round(BASE_PER_DAY[weekday(ds)] * s.load * ramp * future + (rng.float() - 0.5) * 1.6));
      const intervals = busy(s, ds);
      const svcs = bookable(s);
      let placed = 0;
      let cursor = alignUp(sh.start, slot);
      while (cursor < sh.end && placed < target) {
        if (rng.chance(0.3)) { cursor += slot; continue; }
        const main = rng.weighted(svcs.map((sv) => [sv, SERVICE_WEIGHTS[serviceKeyById.get(sv.id)] ?? 1]));
        const list = [main];
        const mainKey = serviceKeyById.get(main.id);
        if (['haircut', 'scissors', 'haircut-beard'].includes(mainKey) && rng.chance(0.1)) {
          const addon = rng.pick(ADDONS.filter((k) => s.serviceKeys.includes(k)));
          if (addon) list.push(serviceByKey.get(addon));
        }
        const total = list.reduce((a, sv) => a + sv.durationMinutes, 0);
        const end = cursor + total + list[list.length - 1].bufferMinutes;
        if (cursor + total > sh.end || overlaps(intervals, cursor, end)) { cursor += slot; continue; }
        placeBooking(s, list, pickClient(s, ds, usedToday), ds, cursor);
        intervals.push({ start: cursor, end });
        placed++;
        cursor = alignUp(end, slot);
      }
    }

    // Walk-in retail sale (no booking) on about a third of the elapsed days.
    if (ds <= todayStr && rng.chance(0.35)) {
      const s = rng.pick(working);
      const sh = s.shifts.get(ds);
      const occurredAt = secs(new Date(at(ds, rng.int(sh.start + 30, sh.end - 30)).getTime() + rng.int(0, 59) * 1000));
      if (occurredAt < now) {
        const orderId = randomUUID();
        const client = rng.chance(0.6) ? rng.pick(clients) : null;
        const picked = [pickProduct('haircut')];
        if (rng.chance(0.3)) { const extra = pickProduct('beard'); if (extra !== picked[0]) picked.push(extra); }
        const items = picked.map((p) => productItem(orderId, s, p, rng.chance(0.08) ? 2 : 1, occurredAt));
        const total = items.reduce((a, i) => a.plus(i.lineTotal), ZERO);
        const createdAt = plus(occurredAt, -2 * MIN);
        out.orders.push({
          id: orderId, locationId, bookingId: null, clientId: client?.id ?? null, clientName: client ? `${client.firstName} ${client.lastName}` : null,
          clientPhone: client?.phone ?? null, currency, status: 'ACTIVE', version: 1, occurredAt, listTotalAmount: total, subtotalAmount: total,
          discountTotal: ZERO, totalAmount: total, createdById: owner.id, createdByName: owner.name, createdAt, updatedAt: occurredAt,
        });
        out.orderItems.push(...items);
        if (client) seen(client, createdAt);
        addAudit({ entityType: 'ORDER', entityId: orderId, eventType: 'ORDER_CREATED', actionType: 'CREATE', occurredAt: createdAt, ...ownerActor, payload: { currency, totalAmount: total.toFixed(2) } });
        addAudit({ entityType: 'ORDER', entityId: orderId, eventType: 'ORDER_ITEM_CONFIRMED', actionType: 'ACTION', occurredAt, ...ownerActor, payload: { currency, totalAmount: total.toFixed(2), orderItemIds: items.map((i) => i.id) } });
        bump('walkIn');
      }
    }
  }

  // ─── Reviews ─────────────────────────────────────────────────────────────────
  const clientById = new Map(clients.map((c) => [c.id, c]));
  for (const b of out.bookings) {
    if (b.status !== 'COMPLETED' || !b.reviewRequestSentAt || !rng.chance(0.3)) continue;
    const items = out.bookingItems.filter((i) => i.bookingId === b.id);
    const rating = rng.weighted([[5, 88], [4, 9], [3, 3]]);
    const first = items[0].staffName;
    const text = rng.pick(REVIEW_TEXTS[rating]).replaceAll('{name}', first);
    const reviewedAt = secs(plus(b.reviewRequestSentAt, rng.int(20, 36 * 60) * MIN));
    if (reviewedAt >= now) continue;
    let replyText = null;
    let repliedAt = null;
    if (rng.chance(rating === 5 ? 0.4 : 1)) {
      const r = secs(plus(reviewedAt, rng.int(60, 30 * 60) * MIN));
      if (r < now) { replyText = rng.pick(REVIEW_REPLIES[rating >= 4 ? rating : 'low']); repliedAt = r; }
    }
    const id = randomUUID();
    out.reviews.push({
      id, locationId, bookingId: b.id, clientId: b.clientId, rating, text, authorFirstName: b.clientFirstName, authorLastName: b.clientLastName,
      reviewedAt, status: 'PUBLISHED', replyText, repliedAt, repliedByName: replyText ? owner.name : null, createdAt: reviewedAt, updatedAt: repliedAt ?? reviewedAt,
    });
    out.reviewStaff.push({ reviewId: id, staffId: items[0].staffId, staffName: items[0].staffName });
    const author = `${b.clientFirstName} ${b.clientLastName}`.trim() || '—';
    const created = createdChanges({ rating, text, status: 'PUBLISHED' }, ['rating', 'text', 'status']);
    addAudit({ entityType: 'REVIEW', entityId: id, eventType: 'REVIEW_CREATED', actionType: 'CREATE', occurredAt: reviewedAt, ...clientActor(b), payload: { title: author, changes: created } });
    if (replyText) addAudit({ entityType: 'REVIEW', entityId: id, eventType: 'REVIEW_REPLIED', actionType: 'MODIFY', occurredAt: repliedAt, ...ownerActor, payload: { title: author, changes: [{ field: 'replyText', from: '—', to: replyText }] } });
  }

  // ─── Returns ─────────────────────────────────────────────────────────────────
  const orderById = new Map(out.orders.map((o) => [o.id, o]));
  const productLines = out.orderItems.filter((i) => i.type === 'PRODUCT');
  const curMonth = todayStr.slice(0, 7);
  const returnCandidate = (i, qty, skus, month) => {
    const ds = zonedDateStr(i.occurredAt, tz);
    return i.quantity.equals(qty) && ds.slice(0, 7) < curMonth && (!month || ds.slice(0, 7) === month) && Number(ds.slice(8)) <= 18 && (!skus || skus.includes(i.sku));
  };
  const fullItem = productLines.find((i) => returnCandidate(i, 1, ['CG-BEARD-OIL-30', 'CG-AFTERSHAVE-100', 'CG-BEARD-BALM-75', 'CG-SHAMPOO-250'], monthsBack(todayStr, 3).slice(0, 7)));
  const pairItem = productLines.find((i) => returnCandidate(i, 2, null, monthsBack(todayStr, 1).slice(0, 7))) ?? productLines.find((i) => returnCandidate(i, 2));
  if (!fullItem || !pairItem) throw new Error('No product sales suitable for the demo returns');
  const returns = [];
  const returnItems = [];
  const returnEvents = [];
  for (const [item, qty, reason] of [[fullItem, 1, 'Не подошёл аромат, товар не вскрыт'], [pairItem, 1, 'Купил два, второй не понадобился — вернул нераспечатанным']]) {
    const saleDs = zonedDateStr(item.occurredAt, tz);
    const ds = addDaysStr(saleDs, rng.int(2, 5));
    const occurredAt = secs(at(ds, rng.int(12 * 60, 18 * 60)));
    const order = orderById.get(item.orderId);
    const returnId = randomUUID();
    const returnItemId = randomUUID();
    const q = D(qty);
    const lineSubtotal = quantize(item.lineSubtotal.mul(q).div(item.quantity));
    const lineTotal = quantize(item.lineTotal.mul(q).div(item.quantity));
    const discountTotal = lineSubtotal.minus(lineTotal);
    const seller = staff.find((s) => s.row.id === item.sellerStaffId);
    const requestHash = createHash('sha256').update(JSON.stringify({ orderId: order.id, reason, occurredAt: iso(occurredAt), items: [{ orderItemId: item.id, quantity: q.toFixed(3) }] })).digest('hex');
    returns.push({
      id: returnId, locationId, orderId: order.id, status: 'POSTED', reason, occurredAt, idempotencyKey: randomUUID(), requestHash,
      createdById: owner.id, createdByName: owner.name, createdAt: occurredAt, updatedAt: occurredAt,
    });
    returnItems.push({
      id: returnItemId, returnId, orderItemId: item.id, productLocationId: item.productLocationId, productId: item.catalogItemId, categoryId: item.categoryId,
      title: item.title, sku: item.sku, unit: item.unit, quantity: q, listUnitPrice: item.listUnitPrice, customUnitPrice: item.customUnitPrice,
      unitPrice: item.unitPrice, lineSubtotal, discountTotal, lineTotal, sellerStaffId: item.sellerStaffId, sellerName: item.sellerName, createdAt: occurredAt,
    });
    returnEvents.push({ orderId: order.id, orderItemId: item.id, orderReturnItemId: returnItemId, plId: item.productLocationId, qty: q, at: occurredAt });

    order.listTotalAmount = order.listTotalAmount.minus(item.listUnitPrice.mul(q));
    order.subtotalAmount = order.subtotalAmount.minus(lineSubtotal);
    order.discountTotal = order.discountTotal.minus(discountTotal);
    order.totalAmount = order.totalAmount.minus(lineTotal);
    order.version += 1;
    order.updatedAt = occurredAt;

    const original = out.earnings.find((e) => e.idempotencyKey === `order-item:${item.id}:PRODUCT_COMMISSION`);
    const full = q.equals(item.quantity);
    out.earnings.push({
      id: randomUUID(), locationId, staffId: seller.row.id, type: 'CORRECTION', source: 'PRODUCT_SALE', earnedOn: original.earnedOn,
      amount: commission(lineTotal, original.ratePercent).neg(), currency, baseAmount: lineTotal, ratePercent: original.ratePercent,
      description: original.description, reason, actorId: owner.id, actorName: owner.name,
      idempotencyKey: `order-item:${item.id}:PRODUCT_COMMISSION:reversal:${lineTotal.toFixed(2)}`, compensationPlanId: original.compensationPlanId,
      orderId: order.id, orderItemId: item.id, orderReturnItemId: returnItemId, reversesEarningId: full ? original.id : null, createdAt: occurredAt,
    });
    addAudit({
      entityType: 'ORDER', entityId: order.id, eventType: 'ORDER_UPDATED', actionType: 'MODIFY', occurredAt, ...ownerActor,
      payload: { orderReturnId: returnId, reason, totalAmount: order.totalAmount.toFixed(2), currency, itemChanges: { added: [], removed: [], changed: [{ orderItemId: item.id, returnedQuantity: q.toFixed(3), returnedTotal: lineTotal.toFixed(2) }] } },
    });
  }

  // ─── Inventory documents (receipts sized from actual demand) ─────────────────
  const docs = [];
  const docItemRows = [];
  const mkDoc = (fields) => ({
    id: randomUUID(), locationId, destinationLocationId: null, supplierId: null, status: 'POSTED', reference: null, supplierName: null, reason: null,
    note: null, createdById: owner.id, createdByName: owner.name, voidedAt: null, items: [],
    createdAt: plus(fields.occurredAt, -rng.int(10, 40) * MIN), postedAt: plus(fields.occurredAt, rng.int(5, 25) * MIN), ...fields,
  });
  const addLine = (doc, product, qty, opts = {}) => {
    const item = {
      id: randomUUID(), documentId: doc.id, productLocationId: product.pl.id, productId: product.row.id, productName: product.name, productSku: product.sku,
      productUnit: 'PIECE', quantity: D(qty), unitCost: opts.unitCost != null ? D(opts.unitCost) : null,
      totalCost: opts.unitCost != null ? quantize(D(qty).mul(opts.unitCost)) : null, packagingId: null, packagingName: null, packagingFactor: null,
      packageQuantity: null, packageUnitCost: null, position: doc.items.length, createdAt: doc.createdAt,
    };
    if (opts.boxes) {
      const boxCost = D(opts.boxCost);
      Object.assign(item, {
        quantity: D(opts.boxes).mul(product.box), packagingId: product.pkg.id, packagingName: product.pkg.name, packagingFactor: product.pkg.quantityInBaseUnit,
        packageQuantity: D(opts.boxes), packageUnitCost: boxCost, totalCost: quantize(boxCost.mul(opts.boxes)), unitCost: q8(boxCost.div(product.box)),
      });
    }
    doc.items.push(item);
    return item;
  };

  const writeOffTesters = mkDoc({ type: 'WRITE_OFF', occurredAt: atHm(addDaysStr(HISTORY_FROM, 36), '19:30'), reason: 'Тестеры для ресепшена' });
  writeOffTesters.reference = `СП-${writeOffTesters.occurredAt.toISOString().slice(5, 10).replace('-', '')}`;
  for (const sku of ['CG-POMADE-100', 'CG-CLAY-75', 'CG-BEARD-OIL-30']) addLine(writeOffTesters, productBySku.get(sku), 1);
  const damagedDs = addDaysStr(todayStr, -7);
  const writeOffDamaged = mkDoc({ type: 'WRITE_OFF', occurredAt: atHm(damagedDs, '20:30'), reference: `СП-${damagedDs.slice(8)}${damagedDs.slice(5, 7)}`, reason: 'Повреждена упаковка при доставке, товар не для продажи' });
  addLine(writeOffDamaged, productBySku.get('CG-SHAMPOO-250'), 1);
  const stocktakeDs = addDaysStr(`${curMonth}-01`, -1);
  const stocktake = mkDoc({ type: 'ADJUSTMENT', occurredAt: atHm(stocktakeDs, '21:15'), reference: `ИНВ-${stocktakeDs.slice(8)}${stocktakeDs.slice(5, 7)}`, reason: `Инвентаризация на ${stocktakeDs.slice(8)}.${stocktakeDs.slice(5, 7)}: расхождения по факту пересчёта` });
  const outflowDocs = [writeOffTesters, writeOffDamaged];

  // Receipt dates: opening the day before the first bookings, then the first Tuesday of each month.
  const receiptDates = [addDaysStr(HISTORY_FROM, -1)];
  for (let m = 1; m <= 4; m++) {
    const first = `${monthsBack(todayStr, 4 - m).slice(0, 7)}-01`;
    let ds = first;
    while (weekday(ds) !== 2) ds = addDaysStr(ds, 1);
    if (ds <= todayStr) receiptDates.push(ds);
  }
  const COST_MULT = [1, 1, 1.03, 1.03, 1.05];
  const receipts = receiptDates.map((ds, i) => ({ ds, at: atHm(ds, '10:30'), mult: COST_MULT[Math.min(i, COST_MULT.length - 1)] }));
  const receiptDocs = [];
  const qtyIn = new Map(products.map((p) => [p.pl.id, []])); // [{at, qty}] receipts so far
  const sumBefore = (list, t, plId) => list.filter((e) => e.plId === plId && e.at < t).reduce((a, e) => a.plus(e.qty), ZERO);
  const docOut = outflowDocs.flatMap((d) => d.items.map((it) => ({ plId: it.productLocationId, qty: it.quantity, at: d.occurredAt })));
  const lastCost = new Map();
  receipts.forEach((r, i) => {
    const next = receipts[i + 1]?.at ?? now;
    for (const supplier of suppliers) {
      const doc = mkDoc({ type: 'RECEIPT', occurredAt: r.at, supplierId: supplier.id, supplierName: supplier.name, reference: `${supplier === suppliers[0] ? 'ТТН' : 'ТН'}-${r.ds.slice(8)}${r.ds.slice(5, 7)}${supplier === suppliers[0] ? '' : '-Л'}`, note: i === 0 ? 'Стартовая поставка на витрину' : null });
      for (const p of products.filter((x) => supplierFor(x) === supplier)) {
        const plId = p.pl.id;
        const stock = qtyIn.get(plId).reduce((a, e) => a.plus(e.qty), ZERO)
          .minus(sumBefore(saleLines, r.at, plId)).minus(sumBefore(docOut, r.at, plId)).plus(sumBefore(returnEvents, r.at, plId));
        const window = (list) => list.filter((e) => e.plId === plId && e.at >= r.at && e.at < next).reduce((a, e) => a.plus(e.qty), ZERO);
        const need = window(saleLines).plus(window(docOut)).plus(p.sku === 'CG-RAZOR-T' ? 2 : 4).minus(stock);
        const boxes = Math.max(i === 0 ? 1 : 0, Math.ceil(need.toNumber() / p.box));
        if (boxes <= 0) continue;
        const boxCost = quantize(D(p.unitCost).mul(r.mult).mul(p.box));
        const line = addLine(doc, p, 0, { boxes, boxCost });
        qtyIn.get(plId).push({ at: r.at, qty: line.quantity });
        lastCost.set(p.sku, line.unitCost);
      }
      if (doc.items.length) receiptDocs.push(doc);
    }
  });
  addLine(stocktake, productBySku.get('CG-SALT-200'), -1);
  addLine(stocktake, productBySku.get('CG-COMB-CLASSIC'), 1, { unitCost: lastCost.get('CG-COMB-CLASSIC') });
  stocktake.items[1].totalCost = quantize(stocktake.items[1].unitCost);
  const allDocs = [...receiptDocs, ...outflowDocs, stocktake].sort((a, b) => a.occurredAt - b.occurredAt);

  for (const doc of allDocs) {
    const snapshot = docSnapshot(doc);
    addAudit({ entityType: 'INVENTORY', entityId: doc.id, eventType: 'INVENTORY_DOCUMENT_CREATED', actionType: 'CREATE', occurredAt: doc.createdAt, ...ownerActor, payload: { type: doc.type, itemCount: doc.items.length, snapshot } });
    addAudit({ entityType: 'INVENTORY', entityId: doc.id, eventType: 'INVENTORY_DOCUMENT_POSTED', actionType: 'ACTION', occurredAt: doc.postedAt, ...ownerActor, payload: { type: doc.type, status: 'POSTED', snapshot, sourceLocationId: locationId, destinationLocationId: null } });
    docItemRows.push(...doc.items);
  }

  // ─── Ledger replay ───────────────────────────────────────────────────────────
  const events = [];
  let ord = 0;
  for (const doc of allDocs) for (const item of doc.items) events.push({ kind: 'doc', at: doc.occurredAt, ord: ord++, doc, item });
  for (const s of saleLines) events.push({ kind: 'sale', at: s.at, ord: ord++, ...s });
  for (const r of returnEvents) events.push({ kind: 'reversal', at: r.at, ord: ord++, ...r });
  events.sort((a, b) => a.at - b.at || a.ord - b.ord);

  const state = new Map(products.map((p) => [p.pl.id, { quantity: ZERO, averageUnitCost: ZERO, stockValue: ZERO }]));
  const movements = [];
  const saleByItem = new Map();
  const reversed = new Map();
  const orderItemCosts = new Map();
  const returnItemCosts = new Map();
  const move = (plId, delta, unitCost, exact, base) => {
    const st = state.get(plId);
    const next = nextState(st, delta, unitCost, exact);
    const p = productByPl.get(plId);
    const row = {
      id: randomUUID(), locationId, productLocationId: plId, productId: p.row.id, productName: p.name, productSku: p.sku, quantityDelta: delta,
      quantityBefore: st.quantity, quantityAfter: next.quantity, averageUnitCostBefore: st.averageUnitCost, averageUnitCostAfter: next.averageUnitCost,
      stockValueBefore: st.stockValue, stockValueAfter: next.stockValue, unitCost, totalCost: next.totalCost, documentId: null, documentItemId: null,
      orderId: null, orderItemId: null, orderReturnItemId: null, reversedMovementId: null, sourceLocationId: locationId, ...base,
    };
    state.set(plId, { quantity: next.quantity, averageUnitCost: next.averageUnitCost, stockValue: next.stockValue });
    movements.push(row);
    return row;
  };
  for (const ev of events) {
    if (ev.kind === 'doc') {
      const { doc, item } = ev;
      const plId = item.productLocationId;
      const delta = doc.type === 'WRITE_OFF' ? item.quantity.neg() : item.quantity;
      const incoming = doc.type === 'RECEIPT' || (doc.type === 'ADJUSTMENT' && delta.gt(0));
      move(plId, delta, incoming ? item.unitCost : state.get(plId).averageUnitCost, incoming ? item.totalCost : undefined, {
        type: doc.type, documentId: doc.id, documentItemId: item.id, sourceType: 'INVENTORY_DOCUMENT', sourceId: doc.id, occurredAt: doc.occurredAt,
        idempotencyKey: `${doc.id}:post:${item.id}:${plId}`, createdAt: doc.postedAt,
      });
    } else if (ev.kind === 'sale') {
      const unitCost = state.get(ev.plId).averageUnitCost;
      const row = move(ev.plId, ev.qty.neg(), unitCost, undefined, {
        type: 'SALE', orderId: ev.orderId, orderItemId: ev.orderItemId, sourceType: 'ORDER', sourceId: ev.orderId, occurredAt: ev.at,
        idempotencyKey: `order:${ev.orderId}:item:${ev.orderItemId}:sale`, createdAt: ev.at,
      });
      saleByItem.set(ev.orderItemId, row);
      orderItemCosts.set(ev.orderItemId, { unitCostSnapshot: unitCost, lineCostSnapshot: row.totalCost.neg() });
    } else {
      const sale = saleByItem.get(ev.orderItemId);
      const sold = sale.quantityDelta.neg();
      const prev = reversed.get(ev.orderItemId) ?? { qty: ZERO, cost: ZERO };
      const totalCost = allocateCumulative(sale.totalCost.neg(), sold, ev.qty, prev.qty, prev.cost);
      const row = move(ev.plId, ev.qty, sale.unitCost, totalCost, {
        type: 'SALE_REVERSAL', orderId: ev.orderId, orderItemId: ev.orderItemId, orderReturnItemId: ev.orderReturnItemId, sourceType: 'ORDER',
        sourceId: ev.orderId, occurredAt: ev.at, idempotencyKey: `order:${ev.orderId}:item:${ev.orderItemId}:sale-reversal:${prev.qty.plus(ev.qty).toFixed(3)}`,
        reversedMovementId: prev.qty.isZero() && ev.qty.equals(sold) ? sale.id : null, createdAt: ev.at,
      });
      reversed.set(ev.orderItemId, { qty: prev.qty.plus(ev.qty), cost: prev.cost.plus(totalCost) });
      returnItemCosts.set(ev.orderReturnItemId, { unitCostSnapshot: sale.unitCost, lineCostSnapshot: row.totalCost });
    }
  }
  for (const it of out.orderItems) if (orderItemCosts.has(it.id)) Object.assign(it, orderItemCosts.get(it.id));
  for (const it of returnItems) Object.assign(it, returnItemCosts.get(it.id));
  const balances = products.map((p) => ({ id: randomUUID(), productLocationId: p.pl.id, ...(({ quantity, averageUnitCost, stockValue }) => ({ quantityOnHand: quantity, averageUnitCost, stockValue }))(state.get(p.pl.id)) }));

  // ─── Payroll (mirrors PayrollService.calculate) ──────────────────────────────
  const periods = [];
  const results = [];
  const attached = new Set();
  const months = [];
  for (let n = 4; n >= 0; n--) {
    const start = `${monthsBack(todayStr, n).slice(0, 7)}-01`;
    months.push({ start, end: monthEnd(start), name: `${MONTHS_RU[Number(start.slice(5, 7)) - 1]} ${start.slice(0, 4)}` });
  }
  const stamp = (ds, hm) => { const t = atHm(ds, hm); return t > now ? plus(now, -10 * MIN) : t; };
  for (const month of months) {
    const current = month.start <= todayStr && todayStr <= month.end;
    const status = current ? 'CALCULATED' : 'PAID';
    const calculatedAt = current ? secs(plus(now, -35 * MIN)) : stamp(addDaysStr(month.end, 1), '10:00');
    const period = {
      id: randomUUID(), locationId, name: month.name, startDate: dateOnly(month.start), endDate: dateOnly(month.end), currency, status, calculatedAt,
      approvedAt: null, approvedById: null, approvedByName: null, paidAt: null, paidById: null, paidByName: null,
      createdAt: plus(calculatedAt, -3 * MIN), updatedAt: calculatedAt,
    };
    if (!current) Object.assign(period, {
      approvedAt: stamp(addDaysStr(month.end, 1), '16:00'), approvedById: owner.id, approvedByName: owner.name,
      paidAt: stamp(addDaysStr(month.end, 5), '12:00'), paidById: owner.id, paidByName: owner.name, updatedAt: stamp(addDaysStr(month.end, 5), '12:00'),
    });
    periods.push(period);

    const dates = enumerateDates(month.start, month.end);
    for (const s of staff) {
      if (s.plan.fixedSalaryAmount == null) continue;
      let prorated = ZERO;
      let daysCovered = 0;
      for (const ds of dates) {
        if (dateOnly(ds) < s.plan.effectiveFrom) continue;
        prorated = prorated.plus(dailySalaryShare(s.plan.fixedSalaryAmount, daysInUtcMonth(dateOnly(ds))));
        daysCovered++;
      }
      prorated = quantize(prorated);
      if (prorated.lte(0)) continue;
      const inPeriod = out.earnings.filter((e) => e.staffId === s.row.id && !attached.has(e.id) && dateOnlyStr(e.earnedOn) >= month.start && dateOnlyStr(e.earnedOn) <= month.end);
      const reversedIds = new Set(inPeriod.map((e) => e.reversesEarningId).filter(Boolean));
      const floor = inPeriod.filter((e) => FLOOR_TYPES.has(e.type) && !reversedIds.has(e.id)).reduce((a, e) => a.plus(e.amount), ZERO);
      const amount = s.plan.salaryMode === 'ADDITIVE' ? prorated : guaranteedTopUp(prorated, floor);
      if (amount.lte(0)) continue;
      out.earnings.push({
        id: randomUUID(), locationId, staffId: s.row.id, type: 'FIXED_SALARY', source: 'PAYROLL', earnedOn: dateOnly(month.end), amount, currency,
        rateAmount: s.plan.fixedSalaryAmount, quantity: D(daysCovered), idempotencyKey: `salary:${period.id}:${s.row.id}`, compensationPlanId: s.plan.id,
        createdAt: calculatedAt,
      });
    }

    const unpaid = out.earnings.filter((e) => !attached.has(e.id) && dateOnlyStr(e.earnedOn) <= month.end);
    let staffCount = 0;
    for (const s of staff) {
      const rows = unpaid.filter((e) => e.staffId === s.row.id);
      if (!rows.length) continue;
      const totals = Object.fromEntries(Object.values(EARNING_TOTAL_FIELD).map((k) => [k, ZERO]));
      totals.totalAmount = ZERO;
      for (const e of rows) { totals[EARNING_TOTAL_FIELD[e.type]] = totals[EARNING_TOTAL_FIELD[e.type]].plus(e.amount); totals.totalAmount = totals.totalAmount.plus(e.amount); }
      const result = {
        id: randomUUID(), periodId: period.id, locationId, staffId: s.row.id, staffName: s.row.name, roleTitle: s.row.roleTitle, taxId: s.row.taxId,
        employeeNumber: s.row.employeeNumber, employmentType: s.row.employmentType, payoutMethod: s.row.payoutMethod, payoutNote: s.row.payoutNote,
        currency, ...totals, earningsCount: rows.length, createdAt: calculatedAt,
      };
      results.push(result);
      for (const e of rows) { e.payrollResultId = result.id; attached.add(e.id); }
      staffCount++;
    }
    addAudit({ entityType: 'PAYROLL', entityId: period.id, eventType: 'PAYROLL_PERIOD_CREATED', actionType: 'CREATE', occurredAt: period.createdAt, ...ownerActor, payload: { startDate: month.start, endDate: month.end } });
    addAudit({ entityType: 'PAYROLL', entityId: period.id, eventType: 'PAYROLL_CALCULATED', actionType: 'ACTION', occurredAt: calculatedAt, ...ownerActor, payload: { staffCount } });
    if (period.approvedAt) addAudit({ entityType: 'PAYROLL', entityId: period.id, eventType: 'PAYROLL_APPROVED', actionType: 'ACTION', occurredAt: period.approvedAt, ...ownerActor, payload: {} });
    if (period.paidAt) addAudit({ entityType: 'PAYROLL', entityId: period.id, eventType: 'PAYROLL_PAID', actionType: 'ACTION', occurredAt: period.paidAt, ...ownerActor, payload: {} });
  }

  // ─── Clients: createdAt, stats ───────────────────────────────────────────────
  const clientRows = clients.map(({ firstSeen, fav, regular, ...c }) => {
    const createdAt = firstSeen
      ? secs(plus(firstSeen, -rng.int(1, 4) * MIN))
      : secs(new Date(BOOKINGS_OPEN_AT.getTime() + rng.float() * (now.getTime() - DAY - BOOKINGS_OPEN_AT.getTime())));
    return { ...c, createdAt, updatedAt: createdAt };
  });
  const pageBookings = out.bookings.filter((b) => b.source === 'PUBLIC_PAGE').length;
  const widgetBookings = out.bookings.filter((b) => b.source === 'WIDGET').length;
  const pageStats = { pageId: page.id, views: pageBookings * rng.int(7, 10), formOpens: pageBookings * 2 + rng.int(0, pageBookings) };
  const widgetStats = { widgetId: widget.id, views: widgetBookings * rng.int(7, 10), formOpens: widgetBookings * 2 + rng.int(0, widgetBookings) };

  // ─── Sanity ──────────────────────────────────────────────────────────────────
  if (out.bookings.some((b) => b.startAt > now && (b.clientEmail || b.reminderDueAt || b.reminderSentAt))) throw new Error('future booking with email/reminder');
  if (out.earnings.some((e) => !e.payrollResultId && e.earnedOn <= dateOnly(todayStr))) throw new Error('unattached earning');
  if (out.reviews.some((r) => r.reviewedAt > now)) throw new Error('future review');

  const summary = {
    period: `${HISTORY_FROM} → ${FUTURE_TO}`, clients: clientRows.length, bookings: out.bookings.length, stats,
    orders: out.orders.length, productSales: saleLines.length, earnings: out.earnings.length, reviews: out.reviews.length,
    docs: allDocs.map((d) => `${d.type} ${d.reference} ${zonedDateStr(d.occurredAt, tz)} (${d.items.length})`),
    movements: movements.length, payroll: periods.map((p) => `${p.name} ${p.status} ${results.filter((r) => r.periodId === p.id).map((r) => `${r.staffName}:${r.totalAmount.toFixed(2)}`).join(' ')}`),
    stock: products.map((p) => `${p.sku} ${state.get(p.pl.id).quantity} @ ${state.get(p.pl.id).averageUnitCost.toFixed(2)}`),
    audit: audit.length, files: files.length,
  };
  console.log(JSON.stringify(summary, null, 1));
  if (process.env.SEED_DRY_RUN) { console.log('Dry run: nothing written.'); return; }

  // ─── Write ───────────────────────────────────────────────────────────────────
  await removePrevious(prisma, bucket, owner.id);
  const prefix = `brands/${brandId}/`;
  await Promise.all(files.map(({ buf, row }) => bucket.file(row.storageKey).save(buf, { metadata: { contentType: row.mimeType, cacheControl: CACHE_CONTROL }, resumable: false })));
  console.log(`uploaded ${files.length} files to gs://${bucketName}/${prefix}`);
  const chunk = async (list, size, fn) => { for (let i = 0; i < list.length; i += size) await fn(list.slice(i, i + size)); };
  const strip = ({ items, ...rest }) => rest;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.file.createMany({ data: files.map((f) => f.row) });
      await tx.brand.create({ data: brand });
      await tx.accessState.create({ data: { brandId, revision: 0 } });
      await tx.brandMembership.create({ data: { userId: owner.id, brandId, role: 'OWNER', createdAt: BRAND_AT, updatedAt: BRAND_AT } });
      await tx.location.create({ data: location });
      await tx.serviceCategory.createMany({ data: categoryRows });
      await tx.service.createMany({ data: services.map((s) => s.row) });
      await tx.staff.createMany({ data: staffRows });
      await tx.staffService.createMany({ data: staffServiceRows });
      await tx.staffCompensationPlan.createMany({ data: planRows });
      await chunk(shiftRows, 500, (d) => tx.staffShift.createMany({ data: d }));
      await tx.calendarEvent.createMany({ data: blockRows });
      await tx.supplier.createMany({ data: suppliers });
      await tx.productCategory.createMany({ data: productCategoryRows });
      await tx.product.createMany({ data: productRows });
      await tx.productPackaging.createMany({ data: packagingRows });
      await tx.productLocation.createMany({ data: plRows });
      await tx.inventoryBalance.createMany({ data: balances });
      await tx.bookingPage.create({ data: page });
      await tx.bookingPageStats.create({ data: pageStats });
      await tx.bookingWidget.create({ data: widget });
      await tx.bookingWidgetStats.create({ data: widgetStats });
      await chunk(clientRows, 500, (d) => tx.client.createMany({ data: d }));
      await chunk(out.calendarEvents, 500, (d) => tx.calendarEvent.createMany({ data: d }));
      await chunk(out.bookings, 500, (d) => tx.booking.createMany({ data: d }));
      await chunk(out.bookingItems, 500, (d) => tx.bookingItem.createMany({ data: d }));
      await chunk(out.orders, 500, (d) => tx.order.createMany({ data: d }));
      await chunk(out.orderItems, 500, (d) => tx.orderItem.createMany({ data: d }));
      await tx.orderReturn.createMany({ data: returns });
      await tx.orderReturnItem.createMany({ data: returnItems });
      await tx.inventoryDocument.createMany({ data: allDocs.map((d) => ({ ...strip(d), updatedAt: d.postedAt })) });
      await chunk(docItemRows, 500, (d) => tx.inventoryDocumentItem.createMany({ data: d }));
      await chunk(movements, 300, (d) => tx.inventoryMovement.createMany({ data: d }));
      await tx.payrollPeriod.createMany({ data: periods });
      await tx.payrollResult.createMany({ data: results });
      const originals = out.earnings.filter((e) => !e.reversesEarningId);
      await chunk(originals, 500, (d) => tx.staffEarning.createMany({ data: d }));
      await tx.staffEarning.createMany({ data: out.earnings.filter((e) => e.reversesEarningId) });
      await chunk(out.reviews, 500, (d) => tx.review.createMany({ data: d }));
      await chunk(out.reviewStaff, 500, (d) => tx.reviewStaff.createMany({ data: d }));
      await chunk(audit.sort((a, b) => a.occurredAt - b.occurredAt).map((a) => ({ ...a, createdAt: a.occurredAt })), 500, (d) => tx.auditLog.createMany({ data: d }));
    }, { timeout: 600_000, maxWait: 30_000 });
  } catch (err) {
    await bucket.deleteFiles({ prefix }).catch(() => {});
    throw err;
  }
  console.log(`brand ${brandId}, location ${locationId}, page /${page.slug}`);
}

async function removePrevious(prisma, bucket, ownerId) {
  const brands = await prisma.brand.findMany({ where: { name: BRAND.name, brandMemberships: { some: { userId: ownerId } } }, select: { id: true } });
  for (const { id: brandId } of brands) {
    const locs = (await prisma.location.findMany({ where: { brandId }, select: { id: true } })).map((l) => l.id);
    await prisma.$transaction(async (tx) => {
      const L = { locationId: { in: locs } };
      await tx.auditLog.deleteMany({ where: { brandId } });
      await tx.staffEarning.updateMany({ where: { ...L, reversesEarningId: { not: null } }, data: { reversesEarningId: null } });
      await tx.staffEarning.deleteMany({ where: L });
      await tx.payrollPeriod.deleteMany({ where: L });
      await tx.inventoryMovement.updateMany({ where: { ...L, reversedMovementId: { not: null } }, data: { reversedMovementId: null } });
      await tx.inventoryMovement.deleteMany({ where: L });
      await tx.orderReturn.deleteMany({ where: L });
      await tx.order.deleteMany({ where: L });
      await tx.inventoryDocument.deleteMany({ where: L });
      await tx.inventoryBalance.deleteMany({ where: { productLocation: L } });
      await tx.review.deleteMany({ where: L });
      await tx.booking.deleteMany({ where: L });
      await tx.calendarEvent.deleteMany({ where: L });
      await tx.brand.delete({ where: { id: brandId } });
      await tx.file.deleteMany({ where: { storageKey: { startsWith: `brands/${brandId}/` } } });
    }, { timeout: 300_000, maxWait: 30_000 });
    await bucket.deleteFiles({ prefix: `brands/${brandId}/` }).catch(() => {});
    console.log(`removed previous demo brand ${brandId}`);
  }
}
