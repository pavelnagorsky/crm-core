# CRM Core

Backend CRM на NestJS, Prisma и PostgreSQL: бренды и филиалы, календарь и бронирования, клиенты, услуги, продажи, склад и зарплата.

## Запуск

Настроить переменные окружения по `.env.example`, затем установить зависимости и подготовить базу:

```sh
npm install
npm run db:deploy
npm run db:generate
npm run start:dev
```

Миграции применяются к `DATABASE_URL` из конфигурации окружения. Для полноценного развёртывания нужны SQL-миграции: `db:push` не создаёт используемые приложением view и collation. Подробности — в [документе каталога](docs/architecture/services-catalog.md#пустая-база-и-восстановление-view).

Swagger UI: `/api`, OpenAPI JSON: `/api-json`. Бизнес-маршруты не имеют общего префикса `/api`.

## Документация

- [Архитектура и навигация по документам](docs/architecture/README.md).
- [Владение данными и границы модулей](docs/architecture/domain-ownership.md).
- [Роли и permissions](docs/architecture/rbac.md), [проверки API](docs/architecture/rbac-permissions-map.md), [контракты управления доступом](docs/architecture/rbac-contracts.md).
- [Интеграция управления доступом на frontend](docs/frontend-access-management.md): участники, приглашения и настройки ролей.
- [Заказы, возвраты и связь с бронированием](docs/orders.md).
- [Удаление и восстановление бизнеса](docs/business-soft-delete.md).
- [Демонстрационные данные](scripts/seed/README.md).

В документации хранятся действующие правила и архитектурные решения. Точные DTO и состав маршрутов определяются кодом и OpenAPI; завершённые планы внедрения и исторические матрицы удалены.

## Проверка и сборка

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Состояние миграций конкретной базы: `npx prisma migrate status`. Настройки дополнительных тестовых запусков находятся в `package.json` и `vitest.config*.ts`.
