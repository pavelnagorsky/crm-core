import { BusinessType } from '@prisma/client';
import { StarterCategoryTemplate } from '../interfaces/starter-category-template.interface.js';
import { StarterServiceTemplate } from '../interfaces/starter-service-template.interface.js';

function service(
  title: string,
  durationMinutes: number,
  rub: number,
  byn: number,
  kzt: number,
): StarterServiceTemplate {
  return {
    title,
    durationMinutes,
    prices: { RUB: String(rub), BYN: String(byn), KZT: String(kzt) },
  };
}

// Editable sample prices for onboarding, not exchange rates or market quotes.
export const STARTER_CATALOG = {
  BARBERSHOP: [
    {
      name: 'Стрижки',
      services: [
        service('Мужская стрижка', 45, 1500, 40, 5000),
        service('Стрижка машинкой', 30, 800, 25, 3000),
      ],
    },
    {
      name: 'Борода',
      services: [service('Оформление бороды', 30, 1000, 30, 3500)],
    },
  ],
  HAIR_SALON: [
    {
      name: 'Стрижки',
      services: [
        service('Стрижка коротких волос', 45, 1500, 40, 5000),
        service('Стрижка длинных волос', 60, 2000, 60, 7000),
      ],
    },
    {
      name: 'Укладки',
      services: [service('Укладка волос', 45, 1500, 45, 5000)],
    },
  ],
  NAIL_SALON: [
    {
      name: 'Маникюр',
      services: [
        service('Маникюр без покрытия', 45, 1000, 30, 4000),
        service('Маникюр с покрытием', 90, 2000, 60, 7000),
      ],
    },
    {
      name: 'Педикюр',
      services: [service('Педикюр без покрытия', 60, 2000, 60, 7000)],
    },
  ],
  BEAUTY_SALON: [
    {
      name: 'Волосы',
      services: [
        service('Стрижка', 60, 2000, 50, 6000),
        service('Укладка волос', 45, 1500, 40, 5000),
      ],
    },
    {
      name: 'Ногтевой сервис',
      services: [service('Маникюр без покрытия', 45, 1000, 30, 4000)],
    },
  ],
  SPA: [
    {
      name: 'SPA-программы',
      services: [service('SPA-уход для тела', 90, 5000, 150, 20000)],
    },
    {
      name: 'Уходы для тела',
      services: [
        service('Обёртывание', 60, 3000, 90, 12000),
        service('Пилинг тела', 45, 2500, 70, 10000),
      ],
    },
  ],
  MASSAGE: [
    {
      name: 'Массаж тела',
      services: [service('Общий массаж', 60, 3000, 80, 10000)],
    },
    {
      name: 'Локальный массаж',
      services: [
        service('Массаж спины', 30, 1800, 50, 6000),
        service('Массаж шейно-воротниковой зоны', 30, 1500, 40, 5000),
      ],
    },
  ],
  COSMETOLOGY: [
    {
      name: 'Консультации',
      services: [service('Консультация косметолога', 30, 1500, 40, 5000)],
    },
    {
      name: 'Уходы за лицом',
      services: [
        service('Базовый уход за лицом', 60, 3000, 90, 12000),
        service('Увлажняющий уход за лицом', 60, 3500, 100, 14000),
      ],
    },
  ],
  TATTOO_PIERCING: [
    {
      name: 'Татуировки',
      services: [
        service('Консультация тату-мастера', 30, 1000, 30, 5000),
        service('Сеанс татуировки', 120, 8000, 250, 30000),
      ],
    },
    {
      name: 'Пирсинг',
      services: [service('Консультация по пирсингу', 30, 1000, 30, 5000)],
    },
  ],
  BROWS_LASHES: [
    {
      name: 'Брови',
      services: [
        service('Коррекция бровей', 30, 700, 20, 2500),
        service('Окрашивание бровей', 30, 1000, 30, 3500),
      ],
    },
    {
      name: 'Ресницы',
      services: [service('Ламинирование ресниц', 60, 2500, 70, 10000)],
    },
  ],
  MEDICAL_CLINIC: [
    {
      name: 'Приёмы',
      services: [
        service('Первичный приём', 45, 2500, 70, 10000),
        service('Повторный приём', 30, 2000, 50, 8000),
      ],
    },
    {
      name: 'Консультации',
      services: [service('Консультация специалиста', 30, 2500, 70, 10000)],
    },
  ],
  FITNESS: [
    {
      name: 'Персональные тренировки',
      services: [
        service('Вводная тренировка', 45, 1000, 30, 4000),
        service('Персональная тренировка', 60, 2000, 50, 7000),
      ],
    },
  ],
  YOGA_STUDIO: [
    {
      name: 'Индивидуальные занятия',
      services: [
        service('Вводное занятие йогой', 45, 1000, 30, 4000),
        service('Индивидуальная практика', 60, 2000, 50, 7000),
      ],
    },
  ],
  AUTO_SERVICE: [
    {
      name: 'Диагностика',
      services: [service('Диагностика автомобиля', 60, 2000, 60, 8000)],
    },
    {
      name: 'Обслуживание',
      services: [
        service('Замена масла', 45, 1500, 40, 5000),
        service('Замена воздушного фильтра', 30, 500, 15, 2000),
      ],
    },
  ],
  PET_GROOMING: [
    {
      name: 'Стрижка и уход',
      services: [service('Комплексный груминг', 120, 3500, 100, 15000)],
    },
    {
      name: 'Гигиена',
      services: [
        service('Мытьё и сушка', 60, 2000, 60, 8000),
        service('Стрижка когтей', 15, 500, 15, 2000),
      ],
    },
  ],
  EDUCATION: [
    {
      name: 'Индивидуальные занятия',
      services: [
        service('Вводное занятие', 30, 500, 15, 2000),
        service('Индивидуальное занятие', 60, 1500, 40, 5000),
      ],
    },
  ],
  PHOTO_STUDIO: [
    {
      name: 'Аренда студии',
      services: [service('Аренда студии на час', 60, 2000, 60, 10000)],
    },
    {
      name: 'Фотосъёмка',
      services: [
        service('Индивидуальная фотосессия', 60, 5000, 150, 25000),
        service('Семейная фотосессия', 60, 6000, 180, 30000),
      ],
    },
  ],
} as const satisfies Record<BusinessType, readonly StarterCategoryTemplate[]>;
