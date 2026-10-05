# API Documentation

## Authentication

### Session-Based (Internal Routes)

All `/api/v1/*` routes (except `/api/v1/public/*`) use Better Auth session cookies. The session carries `activeOrganizationId` which scopes all data access.

### API-Key Based (Public Routes)

`/api/v1/public/*` routes use `Authorization: Bearer bos_<key>` header.

```
GET /api/v1/public/products?q=شاي&limit=50
POST /api/v1/public/customers
```

API keys are scoped: `products:read`, `products:create`, `customers:read`, `customers:create`, etc.

## Rate Limiting

| Route Type | Limiter | Default |
|-----------|---------|---------|
| Public API (`/api/v1/public/*`) | PostgreSQL-backed sliding window | 100 req/min per key |
| Internal API (`/api/v1/*`) | In-memory sliding window | 200 req/min per session |

## Error Envelope

All errors return:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "messageAr": "ليس لديك صلاحية",
    "messageEn": "Insufficient permissions",
    "details": {},
    "requestId": "uuid"
  }
}
```

## Health Endpoints

```
GET /api/health          → { status: "ok" }
GET /api/health/database → { status: "ok", latencyMs: N }
```

## Core Business Routes

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/v1/products` | List/create products |
| GET/POST | `/api/v1/customers` | List/create customers |
| GET/POST | `/api/v1/suppliers` | List/create suppliers |
| POST | `/api/v1/sales` | Create atomic sale (invoice+items+payment+stock+cash) |
| GET | `/api/v1/sales` | List sales invoices |
| POST | `/api/v1/purchases` | Create atomic purchase receipt |
| GET | `/api/v1/purchases` | List purchases |
| POST | `/api/v1/expenses` | Create expense |
| GET | `/api/v1/expenses` | List expenses |
| POST | `/api/v1/pos/hold` | Hold POS cart |
| POST | `/api/v1/pos/pay` | Process POS payment |
| GET | `/api/v1/reports/*` | Sales summary, gross profit, inventory valuation, debt, cashflow |

## Admin Routes

| Method | Path | Description |
|--------|------|-------------|
| GET/POST/DELETE | `/api/v1/admin/api-keys` | Manage API keys |
| POST/GET | `/api/v1/admin/imports` | CSV import wizard (validate → commit) |
| POST/GET | `/api/v1/admin/exports` | Export center |
| POST/GET/PUT | `/api/v1/admin/backups` | Backup management |

## AI Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/ai/chat` | Chat with business copilot |
| POST | `/api/v1/ai/confirm` | Confirm mutating AI action |

## Sync Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/sync` | Batch offline sync |

## Security Headers

Every response includes:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 0`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
