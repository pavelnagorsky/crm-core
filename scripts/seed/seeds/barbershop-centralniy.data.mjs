// Static catalog for the "Барбершоп «Центральный»" demo (Гомель).
// Business facts (address, phone, hours, staff, services, prices, durations) come from the
// public yclients booking form (company 1526001) and @barbershop_centralniy on Instagram.
// Products, clients, bookings and finances are fictional demo data.

export const BRAND = {
  name: 'Барбершоп «Центральный»',
  businessType: 'BARBERSHOP',
};

export const LOCATION = {
  name: 'Центральный — Карповича, 35',
  countryCode: 'BY',
  currency: 'BYN',
  timezone: 'Europe/Minsk',
  businessType: 'BARBERSHOP',
  city: 'Гомель',
  addressLine: 'ул. Карповича, 35',
  phone: '+375333331844',
  instagram: 'https://www.instagram.com/barbershop_centralniy/',
  slotIntervalMinutes: 15,
  advanceBookingWindowDays: 30,
  minimumBookingNoticeMinutes: 30,
  coordinates: { lat: 52.425573, lon: 30.996755 },
};

// Tuesday–Sunday 10:00–21:00, Monday is a day off.
export const OPEN_DAYS = [2, 3, 4, 5, 6, 7]; // ISO weekday
export const OPEN = { start: '10:00', end: '21:00' };

export const SERVICE_CATEGORIES = [
  { name: 'Стрижки', description: 'Мужские и детские стрижки', sortOrder: 0 },
  { name: 'Борода', description: 'Оформление и камуфляж бороды', sortOrder: 1 },
  { name: 'Комплексы', description: 'Несколько услуг за один визит', sortOrder: 2 },
  { name: 'Дополнительно', description: 'Камуфляж, воск и укладка', sortOrder: 3 },
];

// Prices and durations are exactly as published on yclients.
export const SERVICES = [
  {
    key: 'haircut', title: 'Мужская стрижка', category: 'Стрижки', price: '35.00', duration: 60, image: 'svc_haircut.jpg',
    description: 'Стрижка машинкой и ножницами с консультацией по форме, мытьё головы и укладка.',
  },
  {
    key: 'scissors', title: 'Стрижка ножницами', category: 'Стрижки', price: '38.00', duration: 60, image: 'svc_scissors.jpg',
    description: 'Стрижка полностью ножницами — для средней и удлинённой длины, мягкие переходы.',
  },
  {
    key: 'buzz', title: 'Стрижка одной насадкой (налысо)', category: 'Стрижки', price: '20.00', duration: 15,
    description: 'Под одну насадку или налысо, окантовка включена.',
  },
  {
    key: 'father-son', title: 'Отец + сын', category: 'Комплексы', price: '55.00', duration: 120,
    description: 'Две стрижки — для папы и сына. Только простые стрижки: кроп, квиф, полубокс.',
  },
  {
    key: 'haircut-beard', title: 'Стрижка + Борода', category: 'Комплексы', price: '60.00', duration: 90,
    description: 'Мужская стрижка и оформление бороды за один визит, горячее полотенце.',
  },
  {
    key: 'beard', title: 'Оформление бороды', category: 'Борода', price: '30.00', duration: 30, image: 'svc_beard.jpg',
    description: 'Моделирование формы, окантовка опасной бритвой, горячее полотенце и масло.',
  },
  {
    key: 'beard-camo-grey', title: 'Оформление бороды + камуфляж седины', category: 'Борода', price: '55.00', duration: 60,
    description: 'Оформление бороды и тонирование седины — естественный результат без эффекта окрашивания.',
  },
  {
    key: 'beard-camo', title: 'Камуфляж бороды', category: 'Дополнительно', price: '30.00', duration: 30,
    description: 'Тонирование седины в бороде, держится 3–4 недели.',
  },
  {
    key: 'head-camo', title: 'Камуфляж головы', category: 'Дополнительно', price: '30.00', duration: 30,
    description: 'Тонирование седины на голове за 10 минут экспозиции.',
  },
  {
    key: 'wax', title: 'Воск (одна зона)', category: 'Дополнительно', price: '5.00', duration: 5,
    description: 'Удаление волос воском: нос или уши.',
  },
  {
    key: 'styling', title: 'Укладка', category: 'Дополнительно', price: '10.00', duration: 10,
    description: 'Укладка с профессиональной косметикой.',
  },
];

// How often each service is booked (relative weight).
export const SERVICE_WEIGHTS = {
  haircut: 34, scissors: 10, buzz: 7, 'father-son': 4, 'haircut-beard': 18, beard: 10,
  'beard-camo-grey': 3, 'beard-camo': 2, 'head-camo': 2, wax: 1, styling: 1,
};

// Small add-ons that are booked together with a haircut as a second booking item.
export const ADDONS = ['wax', 'styling', 'head-camo'];

export const STAFF = [
  {
    key: 'david', name: 'Давид', roleTitle: 'Старший барбер, владелец', avatar: 'staff_david.jpg',
    description: '5 лет в барберинге — сначала в Екатеринбурге, затем в Москве. Изучал ремесло в ритме столиц, где спрос рождает высочайшее качество. Теперь я в Гомеле, чтобы делиться этим опытом. Приношу сюда не только технику, но и понимание современного мужского стиля. Ваша стрижка — это итог работы в барбершопах двух городов-миллионников.',
    employmentType: 'INDIVIDUAL_ENTREPRENEUR', payoutMethod: 'CASH',
    services: 'all',
    // Works every open day; shorter Sundays.
    schedule: { days: [2, 3, 4, 5, 6, 7], hours: { 7: ['11:00', '19:00'] }, default: ['10:00', '21:00'] },
    lunch: { start: '14:30', end: '15:00' },
    activeFrom: null,
    plan: { serviceCommissionPercent: '60.00', productCommissionPercent: '15.00', salaryMode: 'ADDITIVE' },
    load: 1.0,
  },
  {
    key: 'vlad', name: 'Владислав', roleTitle: 'Старший барбер', avatar: 'staff_vlad.jpg',
    description: 'Знакомьтесь, Владислав! Барбер с 5-летним стажем, настоящий профессионал, которого Давид лично пригласил в команду. Стиль, чёткая работа и понимание мужских стрижек — то, что объединяет Влада с нашим подходом.',
    employmentType: 'SELF_EMPLOYED', payoutMethod: 'BANK_TRANSFER',
    services: 'all',
    // 2/2 rotation anchored on the date below, only on open days.
    schedule: { rotation: { anchor: '2026-07-01', on: 2, off: 2 }, default: ['10:00', '21:00'] },
    lunch: { start: '15:00', end: '15:30' },
    activeFrom: null,
    plan: { serviceCommissionPercent: '45.00', productCommissionPercent: '10.00', salaryMode: 'ADDITIVE' },
    load: 0.85,
  },
  {
    key: 'artur', name: 'Артур', roleTitle: 'Барбер', avatar: 'staff_artur.jpg',
    description: 'Барбер нашей команды. Чистые фейды, классические мужские стрижки и аккуратная борода.',
    employmentType: 'SELF_EMPLOYED', payoutMethod: 'CARD',
    services: ['haircut', 'scissors', 'buzz', 'father-son', 'haircut-beard', 'beard', 'beard-camo-grey', 'beard-camo', 'head-camo', 'wax'],
    schedule: { days: [2, 3, 4, 6], default: ['10:00', '21:00'] },
    lunch: { start: '14:00', end: '14:30' },
    activeFrom: '2026-10-13', // new barber, announced on Instagram in October
    plan: { serviceCommissionPercent: '40.00', productCommissionPercent: '10.00', salaryMode: 'GUARANTEED_MINIMUM', fixedSalaryAmount: '1200.00' },
    load: 0.6,
  },
];

export const PRODUCT_CATEGORIES = [
  { name: 'Стайлинг', description: 'Средства для укладки', sortOrder: 0 },
  { name: 'Уход за бородой', description: 'Масла и бальзамы', sortOrder: 1 },
  { name: 'Уход', description: 'Шампуни и средства после бритья', sortOrder: 2 },
  { name: 'Аксессуары', description: 'Гребни и станки', sortOrder: 3 },
];

// Private label "Центральный Grooming". Images live in scripts/seed/assets/barbershop-centralniy/products/<image>.
export const PRODUCTS = [
  { sku: 'CG-POMADE-100', name: 'Помада для укладки «Центральный», 100 мл', category: 'Стайлинг', image: 'pomade.png', retailPrice: '45.00', unitCost: '21.40', box: 12, weight: 9, description: 'Сильная фиксация, средний блеск. Смывается водой.' },
  { sku: 'CG-CLAY-75', name: 'Матовая глина «Центральный», 75 мл', category: 'Стайлинг', image: 'clay.png', retailPrice: '48.00', unitCost: '23.10', box: 12, weight: 10, description: 'Матовый эффект и плотная текстура для коротких стрижек.' },
  { sku: 'CG-POWDER-20', name: 'Пудра для объёма «Центральный», 20 г', category: 'Стайлинг', image: 'powder.png', retailPrice: '40.00', unitCost: '17.80', box: 12, weight: 5, description: 'Прикорневой объём и лёгкая фиксация без утяжеления.' },
  { sku: 'CG-SALT-200', name: 'Спрей с морской солью «Центральный», 200 мл', category: 'Стайлинг', image: 'sea-salt.png', retailPrice: '36.00', unitCost: '15.90', box: 12, weight: 4, description: 'Текстура и пляжный эффект, основа под укладку.' },
  { sku: 'CG-BEARD-OIL-30', name: 'Масло для бороды «Центральный», 30 мл', category: 'Уход за бородой', image: 'beard-oil.png', retailPrice: '38.00', unitCost: '16.70', box: 12, weight: 8, description: 'Кедр и ветивер. Смягчает бороду и убирает зуд.' },
  { sku: 'CG-BEARD-BALM-75', name: 'Бальзам для бороды «Центральный», 75 мл', category: 'Уход за бородой', image: 'beard-balm.png', retailPrice: '35.00', unitCost: '15.60', box: 12, weight: 5, description: 'Лёгкая фиксация и питание для бороды любой длины.' },
  { sku: 'CG-SHAMPOO-250', name: 'Шампунь 2 в 1 «Центральный», 250 мл', category: 'Уход', image: 'shampoo.png', retailPrice: '32.00', unitCost: '13.90', box: 12, weight: 6, description: 'Для волос и бороды, ежедневное применение.' },
  { sku: 'CG-AFTERSHAVE-100', name: 'Лосьон после бритья «Центральный», 100 мл', category: 'Уход', image: 'aftershave.png', retailPrice: '34.00', unitCost: '14.80', box: 12, weight: 3, description: 'Охлаждает и успокаивает кожу после бритья.' },
  { sku: 'CG-COMB-CLASSIC', name: 'Гребень Classic «Центральный»', category: 'Аксессуары', image: 'comb.png', retailPrice: '18.00', unitCost: '6.40', box: 20, weight: 4, description: 'Ацетат, комбинированный шаг зубьев.' },
  { sku: 'CG-RAZOR-T', name: 'Т-образный станок «Центральный»', category: 'Аксессуары', image: 'razor.png', retailPrice: '85.00', unitCost: '41.50', box: 6, weight: 1, description: 'Классический станок для влажного бритья. Хром, латунь.' },
];

export const CANCEL_REASONS = ['Заболел', 'Перенос по просьбе клиента', 'Не успевает с работы', 'Изменились планы', 'Уехал из города'];
export const INTERNAL_NOTES = ['Постоянный клиент', 'Любит короче на висках', 'Предложить кофе', 'Приходит с сыном', 'Чувствительная кожа — без спиртового лосьона'];
export const NOTES = ['Как в прошлый раз', 'Хочу кроп с текстурой', 'Подровнять бороду, длину оставить', 'Фейд на 0', 'Буду с сыном 7 лет', 'Если можно, побыстрее — обед'];

export const MALE_NAMES = ['Александр', 'Дмитрий', 'Максим', 'Сергей', 'Андрей', 'Алексей', 'Артём', 'Илья', 'Кирилл', 'Михаил', 'Никита', 'Матвей', 'Роман', 'Егор', 'Иван', 'Денис', 'Евгений', 'Павел', 'Владимир', 'Константин', 'Тимур', 'Игорь', 'Олег', 'Вадим', 'Глеб', 'Антон', 'Виталий', 'Юрий', 'Николай', 'Даниил', 'Станислав', 'Руслан', 'Ярослав', 'Богдан', 'Георгий', 'Фёдор', 'Леонид', 'Валерий', 'Арсений', 'Степан'];
export const FEMALE_NAMES = ['Анна', 'Мария', 'Елена', 'Ольга', 'Наталья', 'Татьяна', 'Ирина', 'Юлия', 'Екатерина', 'Светлана'];
export const SURNAMES = ['Ковалёв', 'Новик', 'Шевчук', 'Мельник', 'Бондаренко', 'Ткачук', 'Козлов', 'Лукашевич', 'Жук', 'Морозов', 'Сидоренко', 'Кравченко', 'Гончаров', 'Павлюченко', 'Климович', 'Савицкий', 'Романов', 'Ермаков', 'Демидович', 'Карпович', 'Литвинов', 'Захаренко', 'Борисевич', 'Кузьмич', 'Полещук', 'Шуляк', 'Мартинович', 'Гордеев', 'Ярошевич', 'Дубовик', 'Соловьёв', 'Тарасевич', 'Василевич', 'Короткевич', 'Олешкевич', 'Рыбаков', 'Сечко', 'Хомич', 'Цыганков', 'Белый'];

export const REVIEW_TEXTS = {
  5: [
    'Лучший барбершоп в Гомеле. {name} сделал ровно то, что я хотел, даже лучше.',
    'Стригусь у {name} уже несколько месяцев — стабильно топ. Атмосфера, кофе, музыка — всё на уровне.',
    'Пришёл первый раз по рекомендации друга. Фейд идеальный, борода как с картинки. Теперь только сюда.',
    'Чётко, быстро, без лишних разговоров. Спасибо, {name}!',
    'Отличная стрижка и горячее полотенце для бороды — кайф. Рекомендую.',
    'Привёл сына, оба остались довольны. {name} нашёл подход к ребёнку.',
    'Записался онлайн на вечер после работы, приняли минута в минуту. Результат огонь.',
    '{name} — мастер своего дела. Подсказал, как укладывать дома, и посоветовал глину.',
    'Удобное расположение в центре, приятный интерьер в чёрно-белом стиле. Стрижка 10/10.',
    'Камуфляж седины сделали очень естественно, жена не заметила, но сказала, что я помолодел :)',
    'Уже третий раз у {name}. Каждый раз одинаково хорошо — это главное.',
    'Спасибо за стрижку и бороду! Всё аккуратно, линии ровные.',
  ],
  4: [
    'Хорошая стрижка, но пришлось подождать минут десять.',
    'Всё понравилось, только парковку рядом найти непросто.',
    '{name} постриг отлично, хотелось бы больше окон на выходные.',
    'Качественно, но цена за комплекс могла бы быть чуть ниже.',
  ],
  3: [
    'Нормально, но виски получились короче, чем просил.',
    'Стрижка неплохая, но начали позже записи.',
  ],
};

export const REVIEW_REPLIES = {
  5: ['Спасибо, что выбираете «Центральный»! Ждём снова.', 'Благодарим за отзыв! Передадим мастеру 🤝', 'Спасибо! Рады, что результат понравился.'],
  4: ['Спасибо за отзыв! Учтём замечание.', 'Благодарим! Уже работаем над тем, чтобы окон на выходные было больше.'],
  low: ['Извините за неудобства. Приходите на бесплатную коррекцию — всё поправим.', 'Спасибо за честный отзыв, разберёмся и исправим.'],
};
