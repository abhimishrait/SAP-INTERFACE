# SalesPort × SAP — Backend

Node + Express backend with two halves:

1. **SAP-facing endpoints** (`/sap/*`) — implements the 16 modules from the
   API spec PDF. SAP pushes records here; we validate, transform, and
   persist into the existing `abc_dms` database.
2. **Console APIs** (`/console/*`) — feeds the Next.js console (Overview,
   API Logs, Sync Queue, Modules, Database, Connections views).

## Quick start

```bash
# from the project root
cd backend
npm install
npm run migrate     # creates integration_transactions in abc_dms (idempotent)
npm run dev         # nodemon on http://localhost:4000
```

`.env` ships with the DB creds you supplied and the SAP basic-auth user from
the spec (`SujalFoods` / `SujalFoods@123`).

## Folder structure

```
backend/
├── .env                          # DB + auth + port
├── PENDING.md                    # Q3 (term_days) and Q4 (outstanding_balance)
├── migrations/
│   └── 001_integration_transactions.sql
├── scripts/
│   ├── introspect.js             # dumps abc_dms schema → schema-dump.json
│   └── run-migration.js
└── src/
    ├── server.js                 # express app
    ├── config.js                 # env loader
    ├── db.js                     # mysql2 pool + query/one/withTx helpers
    ├── middleware/
    │   ├── basicAuth.js          # 'Basic SujalFoods:...' guard
    │   ├── txLogger.js           # writes every /sap call to integration_transactions
    │   └── errors.js             # DRF-style {"field":["msg"]} responder
    ├── lib/
    │   ├── statusMap.js          # Y/N/1/0 → bool, Cancel→CANCELLED etc.
    │   ├── validate.js           # required/parseDate/toDecimal + ValidationError
    │   └── lookup.js             # find-by-name helpers for FK resolution
    ├── sap/
    │   ├── router.js             # mounts the 16 routes
    │   ├── _simpleMaster.js      # factory for name+status master tables
    │   ├── bp-master.js          # 3.1
    │   ├── blanket-agreement.js  # 3.2
    │   ├── greater-circles.js    # 3.3
    │   ├── circles.js            # 3.4
    │   ├── container.js          # 3.5
    │   ├── matrix.js             # 3.6
    │   ├── product-class.js      # 3.7
    │   ├── product-name.js       # 3.8
    │   ├── payment-terms.js      # 3.9
    │   ├── price-list-group.js   # 3.10
    │   ├── price-list.js         # 3.11
    │   ├── special-price-list.js # 3.12
    │   ├── products.js           # 3.13
    │   ├── delivery-order.js     # 3.14
    │   ├── balance-status-update.js  # 3.15 (returns 501 — see PENDING.md)
    │   └── order-status-sync.js  # 3.16
    └── console/
        ├── router.js
        ├── overview.js           # GET /console/overview
        ├── transactions.js       # GET /console/transactions[?module=&status=&q=]
        ├── queue.js              # GET /console/queue
        ├── modules.js            # GET /console/modules/stats, /:moduleId/recent
        ├── db.js                 # GET /console/db/tables
        └── connections.js        # GET /console/connections
```

## DMS table mapping

| SAP spec | DMS table |
|---|---|
| BP Master              | `external_user_profiles` + `users` |
| Blanket Agreement      | `schemes` + `scheme_rules` |
| Greater Circles        | `zones` |
| Circles                | `towns` |
| Container              | `packaging_types` |
| Matrix                 | `product_domains` |
| Product Class          | `production_categories` |
| Product Name           | `master_lookups` (category='PRODUCT_NAME') |
| Payment Terms          | `payment_preferences` |
| Price List Group       | `price_groups` |
| Price List             | `price_lists` + `price_list_items` |
| Special Price List     | `special_price_lists` + `special_price_list_items` |
| Products (Variants)    | `products` |
| Delivery Order         | `sales_orders` + `order_items` + `sap_sync_logs` |
| Balance Status Update  | _pending — see PENDING.md_ |
| Order Status Sync      | `sales_orders.status` + `order_status_history` |

## Smoke test

```bash
# Health
curl http://localhost:4000/health

# Create a zone (Basic auth required)
curl -X POST http://localhost:4000/sap/greater-circles/ \
  -u SujalFoods:SujalFoods@123 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Zone A","status":"Y"}'

# See the call in the log
curl http://localhost:4000/console/transactions?limit=5
```

## Spec-driven conventions

- Status: `Y/N/1/0` map to `is_active`. Blanket Agreement uses `A/T`.
- Dates: `YYYY-MM-DD` required (ISO 8601).
- Errors: `400` with `{"field_name": ["msg"]}`. `404` with `{"detail": "Not found."}`.
- Auth: every `/sap/*` requires the `Authorization: Basic …` header from the spec section 2.

## Open items

- `backend/PENDING.md` — Q3 (`payment_preferences.term_days`) and Q4 (BP outstanding_balance).
- Frontend rewire to call `/console/*` instead of mock data — not yet done.
