# Business OS Platform

Multi-tenant, white-label SaaS Business OS for SMEs. Next.js 16 + PostgreSQL 18 + Prisma 7 + Better Auth.

## Features

- **Multi-tenancy**: Shared database, shared schema with `organizationId` isolation
- **Role-based access**: Owner/Admin/Manager/Cashier/Accountant/Viewer roles
- **Core modules**: Products, Inventory, Sales, Purchases, Expenses, Cash, POS, Reports
- **Customization**: 21-type custom field engine, form/table/dashboard builders, formula parser
- **Workflows**: Event-driven automations with condition AST + action executors
- **Offline**: Dexie IndexedDB mirror + outbox sync + conflict resolution
- **AI copilot**: Grounded tool execution, confirmation tokens, usage metering
- **PWA**: Installable, offline-capable, mobile/tablet responsive
- **Integrations**: Scoped API keys, webhooks, CSV import/export, backups
- **i18n**: Arabic (RTL) + English with full localization

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL, AUTH_SECRET, etc.

# 3. Start PostgreSQL (Docker)
docker compose up -d

# 4. Run migrations
npx prisma migrate dev

# 5. Seed platform admin
npx prisma db seed

# 6. Start development server
npm run dev
```

## Project Structure

See `docs/ARCHITECTURE.md` for full details.

## Documentation

- `docs/ARCHITECTURE.md` — System design, tenancy model, data integrity
- `docs/API.md` — API reference, authentication, error envelope
- `docs/DEPLOYMENT.md` — Docker setup, environment variables, production build
- `docs/RLS-EVALUATION.md` — Row-Level Security evaluation and decision
- `ROADMAP.md` — Milestone plan with verifiable goals
- `PROJECT_MAP.md` — Living project map with tech stack and architecture

## Testing

```bash
npx vitest run           # Run all tests
npx tsc --noEmit         # Type check
npx eslint .             # Lint
npm run build            # Production build (uses --webpack for serwist)
```

## License

Private — All rights reserved.
