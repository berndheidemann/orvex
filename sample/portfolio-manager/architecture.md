# Architecture Decisions

> Monolithic full-stack process (Fastify 5 + React 19/Vite 6 + SQLite WAL) with an explicit LLMGateway, interface-based adapters, and offline-first behavior — runnable with a single command.

## Overview

The Portfolio Manager is a single-user tool that runs locally as a monolithic Node.js 22 process. Fastify 5 serves both the REST API (including SSE) and the static assets of the React 19 SPA; SQLite 3 with WAL mode is the sole persistence layer with no external infrastructure. All LLM calls run exclusively through a central `LLMGateway` singleton that combines CostGuard, token logging, prompt versioning, and provider abstraction. The architecture prioritizes simplicity and testability — via a recording pattern for LLM calls and contract tests against every PRD verification requirement — over abstract flexibility. Full offline functionality for stored data is a hard invariant; external API failures degrade individual features but never block the app from starting.

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Runtime | Node.js 22 LTS + TypeScript 5.7 strict | LTS stability; TypeScript strict from day one prevents type drift |
| Backend | Fastify 5 | Performant, schema-validated, pino-native, plugin system for clean modularity |
| Frontend | React 19 + Vite 6 (SPA) | Concurrent features; Vite for fast HMR and optimized build |
| Database | SQLite 3 (WAL) via better-sqlite3 | Zero infrastructure; WAL allows concurrent reads during research writes; synchronous — no serializer needed |
| ORM | Drizzle ORM + drizzle-kit | TypeScript-first, schema as single source of truth for all types |
| LLM Abstraction | Vercel AI SDK 4.x (within LLMGateway) | `generateObject()` with Zod schema eliminates manual JSON parsing; provider switch in one line |
| Web Research | Tavily API behind WebSearchAdapter | High quality for financial research; interface allows replacement without service changes |
| Quote API | yahoo-finance2 behind QuoteProvider | Free, batch fetching of multiple tickers |
| ISIN Lookup | OpenFIGI API (on-demand) | Free; three-stage: Yahoo → OpenFIGI (ISIN→Ticker) → Yahoo |
| Styling | Tailwind CSS 4 + shadcn/ui | Utility-first, consistent components without design overhead |
| Client State | TanStack Query v5 | Server-state caching, refetch logic, optimal for API-centric SPA |
| Client Routing | react-router-dom v7 | 4 explicit routes, no file-based routing needed |
| Charts | Recharts | Sufficient for mini-charts and metrics histories |
| Status Updates | Server-Sent Events (SSE) | Unidirectional push for research status; no WebSocket overhead |
| Test (Unit/Contract) | Vitest 3 (`vitest.config.ts`) | Fast feedback loop, no I/O |
| Test (Integration) | Vitest 3 (`vitest.config.integration.ts`) | In-memory SQLite with migrations, separate pool |
| Test (E2E) | Playwright 1.50 (workers=1) | SQLite-safe, full-stack against real server |
| Logging | pino (Fastify default) + pino-roll | Structured JSON, log rotation (max 50 MB, 3 files, `data/logs/`) |
| Env Validation | Zod | Type-safe parsing of `process.env`; missing keys → degraded mode instead of crash |

**Dissenting Points (2:1 majority decisions):**
- **Vercel AI SDK vs. direct OpenAI SDK:** Arch + SenDev for Vercel AI SDK within Gateway due to `generateObject()` type safety; DevOps for direct SDK. → **Vercel AI SDK** (2:1).
- **Retry vs. Circuit Breaker:** Arch + SenDev for `withRetry`; DevOps revised position in R3. → **withRetry + Backoff** (consensus R3).
- **DbWriter PQueue vs. `transaction()`:** Arch + SenDev against PQueue (synchronous writes don't need a serializer); DevOps maintains PQueue position. → **`transaction()` is sufficient** (2:1).

## System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Browser (SPA)                              │
│  React 19 + TanStack Query + shadcn/ui + Recharts              │
│  react-router-dom v7 · SSE-Listener (Auto-Reconnect)           │
│  Error Boundaries (Route-Level + StockCard-Level)              │
│  OfflineBanner · PrivacyConsentDialog (once, First Start)      │
└───────────────────────┬────────────────────────────────────────┘
                        │ HTTP + SSE  (127.0.0.1:3000)
┌───────────────────────▼────────────────────────────────────────┐
│         Fastify 5  (127.0.0.1:3000 ONLY)                       │
│                                                                │
│  API Routes (~10 endpoints, Fastify plugins)                   │
│  POST /api/depot · GET /api/search · GET /api/costs            │
│  GET|POST /api/depot/:id/research · /metrics · /moat           │
│  POST /api/depot/:id/analysis · GET /api/health                │
│  GET /api/depot/:id/history · GET /api/events (SSE)            │
│  POST /api/settings/reload-env                                 │
│                                                                │
│  Service Layer  (Constructor Injection, no DI container)       │
│  DepotSvc · QuoteSvc · ResearchSvc · MetricsSvc                │
│  MoatSvc · AnalysisSvc · SearchSvc · CostSvc                  │
│                                                                │
│  Infrastructure Layer                                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ LLMGateway  (Singleton)                                  │  │
│  │  ├─ CostGuard        Budget check BEFORE every call      │  │
│  │  ├─ Vercel AI SDK 4.x  generateText / generateObject     │  │
│  │  ├─ Token-Logging    → cost_log  (AFTER every call)      │  │
│  │  ├─ Model-Router     fast→gpt-4o-mini / capable→gpt-4o   │  │
│  │  ├─ completeBatch()  Reserve budget upfront for parallel  │  │
│  │  └─ RecordingWrapper Test: record / playback             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────┐ ┌──────────────────┐ ┌───────────────┐   │
│  │ QuoteProvider    │ │ WebSearchAdapter │ │ ISINResolver  │   │
│  │ (Interface)      │ │ (Interface)      │ │ (OpenFIGI)    │   │
│  │ └─ Yahoo impl.   │ │ └─ Tavily impl.  │ │               │   │
│  │ └─ Mock impl.    │ │ └─ Mock impl.    │ │               │   │
│  └──────────────────┘ └──────────────────┘ └───────────────┘   │
│                                                                │
│  ┌──────────────────┐ ┌──────────────────┐                     │
│  │ ResearchQueue    │ │ SSE Emitter      │                     │
│  │ In-Process       │ │ Event-Bus for    │                     │
│  │ max 2 concurrent │ │ Status Updates   │                     │
│  │ dedup 5-min      │ │                  │                     │
│  └──────────────────┘ └──────────────────┘                     │
│                                                                │
│  DB (Drizzle ORM) → SQLite WAL + FTS5 Triggers                 │
│  File: data/portfolio.db  ·  Backups: data/backups/ (max 5)    │
└────────────────────────────────────────────────────────────────┘

Startup Sequence:
  .env (Zod) → SQLite + PRAGMAs → Backup → Migrate →
  Zombie-Cleanup → Health-Probe (non-blocking) → listen()

Graceful Shutdown (SIGINT / SIGTERM):
  Fastify.close() → Queue drain (max 10s) →
  Jobs → pending → SSE close → Backup → SQLite close → Exit 0
```

## Project Structure

```
portfolio_manager/
├── package.json                       # Single package.json
├── package-lock.json                  # Committed; npm ci in CI
├── tsconfig.json                      # Base: strict, paths: { @shared }
├── tsconfig.server.json               # extends base, target: ES2022
├── vite.config.ts                     # SPA build + dev proxy (/api → :3001)
├── vitest.config.ts                   # Unit + Contract tests (no I/O)
├── vitest.config.integration.ts       # Integration tests (In-Memory SQLite)
├── playwright.config.ts               # E2E: webServer, workers=1, DB_PATH=test.db
├── drizzle.config.ts
├── .env.example
├── .gitignore                         # .env, data/, dist/, logs/
├── src/
│   ├── server/
│   │   ├── index.ts                   # listen() + startup sequence + graceful shutdown
│   │   ├── app.ts                     # buildApp() — testable without listen()
│   │   ├── db/
│   │   │   ├── schema.ts              # Drizzle Schema (single source of truth for types)
│   │   │   ├── client.ts              # SQLite init, WAL, Pragmas, Auto-Migrate, Backup
│   │   │   └── migrations/
│   │   ├── routes/                    # Fastify plugins, one file per resource
│   │   │   ├── depot.ts  search.ts  research.ts
│   │   │   ├── metrics.ts  moat.ts  analysis.ts
│   │   │   ├── history.ts  costs.ts  health.ts
│   │   │   └── events.ts              # SSE
│   │   ├── services/
│   │   │   ├── depot.service.ts  quote.service.ts  research.service.ts
│   │   │   ├── metrics.service.ts  moat.service.ts  analysis.service.ts
│   │   │   └── search.service.ts  cost.service.ts
│   │   ├── infra/
│   │   │   ├── llm-gateway.ts         # Singleton: CostGuard + Vercel AI SDK + Logging
│   │   │   ├── llm-gateway.recorder.ts   # Record/Playback for tests
│   │   │   ├── web-search.ts          # Tavily behind WebSearchProvider interface
│   │   │   ├── quote-adapter.ts       # Yahoo behind QuoteProvider interface
│   │   │   ├── isin-resolver.ts       # OpenFIGI
│   │   │   ├── research-queue.ts      # In-process queue, max 2 concurrent
│   │   │   ├── sse-emitter.ts         # SSE Event-Bus
│   │   │   ├── env.ts                 # Zod env validation
│   │   │   └── retry.ts               # withRetry() utility
│   │   ├── prompts/                   # Versioned prompt files
│   │   │   ├── research-quarterly.v1.ts
│   │   │   ├── research-news.v1.ts
│   │   │   ├── moat-assessment.v1.ts
│   │   │   └── analysis-perspectives.v1.ts
│   │   └── shared/
│   │       └── errors.ts              # Domain error classes
│   ├── client/
│   │   ├── index.html                 # Vite entrypoint
│   │   ├── main.tsx
│   │   ├── App.tsx                    # Router + QueryClientProvider
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── StockDetail.tsx        # Timeline + Metrics + Moat + Analysis
│   │   │   └── Settings.tsx           # Budget, API keys, cost overview, privacy
│   │   ├── components/
│   │   │   ├── ErrorBoundary.tsx      # Route-Level + StockCard-Level
│   │   │   ├── StockSearch.tsx  StockCard.tsx  Timeline.tsx
│   │   │   ├── MetricsTable.tsx  MiniChart.tsx  MoatRadar.tsx
│   │   │   ├── AnalysisReport.tsx  CostBadge.tsx  OfflineBanner.tsx
│   │   ├── hooks/
│   │   │   ├── useApi.ts              # TanStack Query hooks
│   │   │   └── useSSE.ts              # SSE with auto-reconnect
│   │   └── lib/
│   │       └── api-client.ts
│   └── shared/
│       └── types.ts                   # Drizzle-derived types (server + client)
├── data/                              # gitignored
│   ├── portfolio.db  backups/  logs/
├── tests/
│   ├── setup.ts                       # createTestDb(), createTestApp(), seed fixtures
│   ├── contracts/                     # PRD verification as TDD anchors
│   │   ├── depot.contract.test.ts  research.contract.test.ts
│   │   ├── metrics.contract.test.ts  costs.contract.test.ts
│   ├── __recordings__/                # LLM response recordings (committed, in Git)
│   │   ├── research/  analysis/  moat/
│   └── integration/
└── e2e/
    ├── fixtures.ts
    ├── dashboard.spec.ts  stock-detail.spec.ts  add-stock.spec.ts
```

## Data Model

```sql
-- ===== Core =====

stocks (
  id                  TEXT PRIMARY KEY,   -- ULID
  ticker              TEXT NOT NULL,
  name                TEXT NOT NULL,
  exchange            TEXT NOT NULL,
  isin                TEXT,
  currency            TEXT NOT NULL,
  added_at            TEXT NOT NULL,
  last_visited_at     TEXT,              -- Last click on detail page
  last_price          REAL,              -- Fallback on API failure
  last_price_at       TEXT,
  price_at_last_visit REAL,              -- Baseline for "since last visit" comparison
  UNIQUE(ticker, exchange)
);

transactions (
  id          TEXT PRIMARY KEY,
  stock_id    TEXT REFERENCES stocks ON DELETE CASCADE,
  type        TEXT CHECK(type IN ('buy','sell','dividend')),
  date        TEXT NOT NULL,
  shares      REAL,
  price       REAL,
  currency    TEXT,
  fees        REAL DEFAULT 0,
  created_at  TEXT NOT NULL
);

-- ===== Research =====

research_items (
  id             TEXT PRIMARY KEY,
  stock_id       TEXT REFERENCES stocks ON DELETE CASCADE,
  type           TEXT CHECK(type IN ('quarterly_report','news')),
  period         TEXT,                -- 'Q3 2024' (NULL for news)
  title          TEXT,
  content        TEXT NOT NULL,       -- Markdown (consistent for future embedding pipeline)
  source_url     TEXT,
  source_name    TEXT,
  fetched_at     TEXT NOT NULL,
  status         TEXT CHECK(status IN ('complete','partial','error')),
  error_detail   TEXT,
  prompt_version TEXT,                -- e.g. 'research-quarterly-v1.0'
  is_current     INTEGER DEFAULT 1,   -- 1 = active, 0 = superseded
  supersedes     TEXT REFERENCES research_items,
  raw_data       TEXT                 -- JSON raw data
);

-- Partial unique index: only one active entry per stock+type+period
CREATE UNIQUE INDEX idx_research_current
  ON research_items(stock_id, type, period)
  WHERE is_current = 1;

-- ===== Metrics =====

metrics (
  id                 TEXT PRIMARY KEY,
  stock_id           TEXT REFERENCES stocks ON DELETE CASCADE,
  name               TEXT NOT NULL,
  quarter            TEXT NOT NULL,
  value              REAL,            -- NULL = not available (≠ 0)
  currency           TEXT,
  source_url         TEXT,
  source_name        TEXT,
  fetched_at         TEXT,
  status             TEXT CHECK(status IN ('available','unavailable','conflicting')),
  conflict_detail    TEXT,            -- JSON: [{source, value}, ...]
  is_custom          INTEGER DEFAULT 0,
  manually_confirmed INTEGER DEFAULT 0,
  UNIQUE(stock_id, name, quarter)
);

-- ===== Moat =====

moat_assessments (
  id             TEXT PRIMARY KEY,
  stock_id       TEXT REFERENCES stocks ON DELETE CASCADE,
  category       TEXT CHECK(category IN
                   ('brand','network_effects','cost_advantages',
                    'switching_costs','regulatory')),
  rating         TEXT CHECK(rating IN ('strong','medium','weak','none')),
  reasoning      TEXT,
  source         TEXT CHECK(source IN ('ai','user')),
  created_at     TEXT NOT NULL,
  prompt_version TEXT,
  supersedes     TEXT REFERENCES moat_assessments
);

-- ===== AI Analysis =====

analysis_reports (
  id                 TEXT PRIMARY KEY,
  stock_id           TEXT REFERENCES stocks ON DELETE CASCADE,
  status             TEXT CHECK(status IN ('running','complete','cancelled','error')),
  started_at         TEXT NOT NULL,
  completed_at       TEXT,
  perspectives       TEXT,            -- JSON: [{role, content, datapointsReferenced, dataGaps}]
  summary            TEXT,
  consensus_points   TEXT,            -- JSON array
  dissent_points     TEXT,            -- JSON array
  rounds_completed   INTEGER DEFAULT 0,
  max_rounds         INTEGER DEFAULT 5,
  prompt_version     TEXT,
  estimated_cost_eur REAL,
  actual_cost_eur    REAL
);

-- ===== Costs =====

cost_log (
  id             TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,       -- 'research' | 'analysis' | 'moat' | 'retry'
  stock_id       TEXT REFERENCES stocks,
  tokens_input   INTEGER NOT NULL,
  tokens_output  INTEGER NOT NULL,
  model          TEXT NOT NULL,
  estimated_eur  REAL NOT NULL,
  created_at     TEXT NOT NULL,
  completed      INTEGER DEFAULT 1    -- 0 = cancelled (partially recorded)
);

-- ===== Full-Text Search =====

search_documents (
  id           TEXT PRIMARY KEY,
  stock_id     TEXT NOT NULL,
  source_table TEXT NOT NULL,         -- 'research_items' | 'analysis_reports'
  source_id    TEXT NOT NULL,
  doc_type     TEXT NOT NULL,         -- 'quarterly_report' | 'news' | 'analysis'
  period       TEXT,
  title        TEXT,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  UNIQUE(source_table, source_id)
);

CREATE VIRTUAL TABLE search_index USING fts5(
  title,
  body,
  content='search_documents',
  content_rowid='rowid'
);

-- Trigger: research_items → search_documents + search_index
CREATE TRIGGER research_ai AFTER INSERT ON research_items
WHEN NEW.is_current = 1
BEGIN
  INSERT INTO search_documents(id, stock_id, source_table, source_id,
    doc_type, period, title, body, created_at)
  VALUES (NEW.id, NEW.stock_id, 'research_items', NEW.id,
    NEW.type, NEW.period, NEW.title, NEW.content, NEW.fetched_at);
  INSERT INTO search_index(rowid, title, body)
  VALUES (last_insert_rowid(), NEW.title, NEW.content);
END;

-- Trigger: analysis_reports → search_documents + search_index
CREATE TRIGGER analysis_ai AFTER UPDATE ON analysis_reports
WHEN NEW.status = 'complete'
BEGIN
  INSERT OR REPLACE INTO search_documents(id, stock_id, source_table,
    source_id, doc_type, period, title, body, created_at)
  VALUES (NEW.id, NEW.stock_id, 'analysis_reports', NEW.id,
    'analysis', NULL, 'AI Analysis', NEW.summary, NEW.completed_at);
  INSERT INTO search_index(rowid, title, body)
  VALUES (last_insert_rowid(), 'AI Analysis', NEW.summary);
END;

-- Trigger: remove superseded entries from search index
CREATE TRIGGER research_supersede AFTER UPDATE ON research_items
WHEN NEW.is_current = 0
BEGIN
  DELETE FROM search_documents
    WHERE source_table = 'research_items' AND source_id = NEW.id;
END;

-- ===== App State =====

settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL               -- JSON string
);
-- Initial values:
-- { key: 'last_dashboard_visit',   value: '"2025-01-01T00:00:00Z"' }
-- { key: 'budget_limit_eur',       value: '20' }
-- { key: 'privacy_consent_given',  value: 'false' }

-- ===== SQLite Pragmas (set on DB open) =====
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```

---

## ADR-001: Monolithic Full-Stack Process (2026-02-22)

**Context:** An analysis tool for private investors that should start locally with a single command (REQ-006). Alternatives: monorepo with separate processes, Docker Compose, Next.js as a full-stack framework.

**Decision:** Fastify 5 serves the API + static Vite build assets in a single Node.js process on `127.0.0.1:3000`. No Docker, no monorepo, no reverse proxy. In dev mode, Vite (port 5173) and Fastify (port 3001) run separately, connected via Vite's `/api` proxy.

**Rationale:** `npm start` means one command, one process, one port. For a single-user local tool, every infrastructure layer above this minimum is pure overhead without benefit. Fastify's plugin system enables structured modularity without external build coupling. `buildApp()` in `app.ts` is separated from `listen()` in `index.ts` — this makes Fastify callable with `.inject()` in tests without a network stack.

**Consequences:**
- `npm start` → `node dist/server/index.js`, binds to `127.0.0.1:3000`, serves `dist/client/`
- `npm run dev` → `concurrently` starts `tsx watch src/server/index.ts` (port 3001) and `vite` (port 5173); SSE proxy requires `Accept: text/event-stream` header set explicitly
- Build scripts:
```jsonc
{
  "dev":       "concurrently -n api,web -c blue,green \"tsx watch src/server/index.ts\" \"vite\"",
  "build":     "vite build && tsc -p tsconfig.server.json --outDir dist/server",
  "start":     "node dist/server/index.js",
  "setup":     "npm ci && cp -n .env.example .env",
  "test":      "vitest run",
  "test:integration": "vitest run -c vitest.config.integration.ts",
  "test:contracts":   "vitest run tests/contracts/",
  "test:e2e":  "playwright test",
  "test:record": "LLM_RECORD=true vitest run",
  "typecheck": "tsc --noEmit",
  "lint":      "eslint src/",
  "validate":  "npm run typecheck && npm run lint && npm run test && npm run test:contracts && npm run test:integration && npm run build"
}
```
- Playwright configuration: `reuseExistingServer: !process.env.CI`; readiness check against `/api/health`, not against root URL; `DB_PATH=./data/test.db` via `env` field in `webServer` block

---

## ADR-002: SQLite WAL Mode with better-sqlite3 (2026-02-22)

**Context:** Local single-user persistence without external infrastructure. Requirements: concurrent reads during active research writes (multiple queue jobs simultaneously), reliable ACID guarantees, FTS5 for full-text search, backup strategy.

**Decision:** SQLite 3 with WAL mode via `better-sqlite3`. No PQueue write serializer. Backup via SQLite's `.backup()` API before each migration. PRAGMA configuration as in the data model.

**Rationale:** `better-sqlite3` is synchronous — every `.run()` call blocks until completion. In a single-process Node.js server, two synchronous writes cannot physically overlap; `SQLITE_BUSY` occurs exclusively in multi-process scenarios, which do not exist here. A PQueue wrapper around synchronous calls creates Promise overhead for a non-existent problem. Drizzle's `transaction()` wrapper is atomic and sufficient. `PRAGMA busy_timeout = 5000` handles the theoretical edge case (Playwright with multiple workers against the same DB) as a safety net. WAL mode is required because research queue writes and dashboard reads occur simultaneously.

**Consequences:**
- Automatic backup (`sqlite.backup(path)`) before each migration into `data/backups/`; rotation to max 5 files
- Backup failure: warn log, no startup abort
- Zombie recovery on startup: `UPDATE research_items SET status='pending' WHERE status='running'` and analogously for `analysis_reports`
- Crash-safe partial results via UPSERT within each individual research step
- FTS5 sync exclusively via SQLite triggers (no manual sync code in services), see ADR-011

---

## ADR-003: LLMGateway as Single Entry Point for LLM Calls (2026-02-22)

**Context:** LLM calls incur costs, require versioning, must be reproducible in tests without real API keys, and must not exceed budget limits. Three parallel calls (REQ-008) create a race condition on the budget limit.

**Decision:** Singleton class `LLMGateway` in `src/server/infra/llm-gateway.ts` as the sole export point for LLM operations. No service imports `openai`, `@anthropic-ai/sdk`, or `ai` directly. Three public methods: `complete()`, `completeBatch()`, `estimateTokens()`.

```typescript
class LLMGateway {
  async complete(opts: LLMRequest): Promise<LLMResponse> { ... }

  // Reserves budget for all calls upfront — prevents race condition
  async completeBatch(requests: LLMRequest[]): Promise<LLMResponse[]> {
    const totalEstimate = requests.reduce(
      (sum, r) => sum + this.estimateTokens(r.messages), 0
    );
    const { allowed, reason } = await this.costGuard.check(totalEstimate);
    if (!allowed) throw new BudgetExceededError(reason);
    return Promise.all(requests.map(r => this.executeCall(r)));
  }
}
```

**Rationale:** Centralization guarantees complete enforcement of CostGuard (budget check before every call), token logging (after every call), and recording pattern (for tests). `completeBatch()` solves the race condition problem with three parallel analysis calls: the total budget is atomically checked and reserved upfront — no third call goes through when the budget only covers two. Model router: `model: 'fast'` → gpt-4o-mini for structured extraction; `model: 'capable'` → gpt-4o for qualitative analysis.

**Consequences:**
- Every LLM call is logged in `cost_log` — including cancelled ones (`completed=0`, partial)
- `prompt_version` is a required parameter on every call; if missing, the gateway throws an error
- Recording mode via env: `LLM_RECORD=true` → real calls + recording; `NODE_ENV=test` → playback; `npm run dev` → passthrough
- Cost estimate before start: 1.5× buffer for possible retries; communicated in UI as "up to X EUR"
- Privacy consent check: gateway checks `settings.privacy_consent_given` synchronously before every external call (see ADR-012)

---

## ADR-004: Vercel AI SDK 4.x Within the LLMGateway (2026-02-22)

**Context:** Choice of LLM execution engine within the LLMGateway. Options: Vercel AI SDK 4.x vs. direct `openai` SDK. The gateway abstracts the provider anyway — the question is what is used internally.

**Decision:** Vercel AI SDK 4.x internally in the `LLMGateway`. Not visible as a global dependency, not imported outside the gateway.

**Rationale:** `generateObject()` with Zod schema is critical for metrics extraction (REQ-003, REQ-004):

```typescript
// generateObject() → type-safe object, no manual JSON.parse
const { object } = await generateObject({
  model: openai('gpt-4o-mini'),
  schema: z.object({
    revenue: z.number().nullable(),
    operatingMargin: z.number().nullable(),
    outlook: z.string(),
  }),
  prompt: extractionPrompt,
});
// object is fully type-safe, Zod-validated
```

The direct OpenAI SDK requires `response_format: { type: 'json_schema' }` + manual parsing + manual Zod validation — more custom code with the same failure modes. Provider switching remains a one-liner (`createAnthropic()` instead of `createOpenAI()`). For streaming UX in phase 2, the AI SDK provides `streamText()` with token callbacks without requiring us to implement custom chunking.

**Consequences:**
- Breaking changes in the Vercel AI SDK are local gateway refactorings, with no impact on services
- `generateText()` for free-form text (moat assessments, analysis perspectives); `generateObject()` for structured data extraction (metrics)

---

## ADR-005: In-Process Job Queue for Web Research (2026-02-22)

**Context:** Research jobs run asynchronously and must not block the UI (REQ-003). At the same time, at most 2 jobs should run concurrently to avoid triggering API rate limits. Duplicate requests for the same stock must be deduplicated.

**Decision:** Promise-based in-process queue (`src/server/infra/research-queue.ts`) with max. 2 concurrent jobs. Deduplication: same stock + type + 5-minute window = job is ignored. SSE emitter sends status events per job progress. Crash recovery on startup.

**Rationale:** An external queue (Redis, BullMQ) would be infrastructure overkill for a single-user tool with occasional manual triggers. The realistic queue depth (max. 20 stocks × 4 quarters = 80 jobs) fits comfortably in process memory. Partial results are saved via UPSERT after each successfully completed sub-task — a job crash does not lose all already-fetched quarters.

**Consequences:**
- Research status per stock: `Research running` / `Current` / `Partially loaded` / `Error at [Source X]`
- Automatic retry on transient errors: max 3×, exponential backoff (1s/3s/9s) via `withRetry()`
- Failed sources are shown by name, not generically as "Error"
- Graceful shutdown: queue drains, max 10s; then running jobs → `status='pending'`, partial results already saved

---

## ADR-006: Research Versioning with is_current + supersedes (2026-02-22)

**Context:** Re-research should not overwrite old results — the timeline history must be preserved. At the same time, it must be guaranteed that only one active entry exists per stock+type+period. A normal UNIQUE constraint would break when inserting the new entry while the old one still exists.

**Decision:** Soft-delete pattern with `is_current INTEGER DEFAULT 1`. During re-research within a SQLite transaction: set old entry to `is_current=0`, insert new one with `is_current=1` and `supersedes=old.id`. Partial unique index enforces uniqueness only for active entries:

```sql
CREATE UNIQUE INDEX idx_research_current
  ON research_items(stock_id, type, period)
  WHERE is_current = 1;
```

**Rationale:** The partial index is the most elegant SQLite solution: the database enforces the constraint without application logic, but allows multiple entries with the same values as long as only one is active. The same pattern applies to `moat_assessments`. Timeline queries are simple (`WHERE is_current = 1`); version drill-down shows all entries without an `is_current` filter.

**Consequences:**
- Timeline always shows `WHERE is_current = 1`
- Drill-down: `WHERE stock_id = ? AND type = ? AND period = ? ORDER BY fetched_at DESC`
- FTS5 trigger automatically removes superseded entries from the search index (see ADR-011)
- `prompt_version` is permanently retained on every entry — including superseded rows

---

## ADR-007: Interface-Based External Adapters (2026-02-22)

**Context:** Three external APIs (yahoo-finance2, Tavily, OpenFIGI) must be replaceable by mocks in tests and swappable against alternative providers in production without changing services.

**Decision:** All external APIs behind TypeScript interfaces. Production implementations in `src/server/infra/`. Mock implementations in `tests/`. Interface injection via constructor in services (no DI container, explicit wiring in `buildApp()`).

```typescript
interface QuoteProvider {
  getQuote(ticker: string, exchange: string): Promise<Quote | null>;
  getQuotes(tickers: TickerExchange[]): Promise<Quote[]>;  // Batch from the start
}

interface WebSearchProvider {
  search(query: string, opts: SearchOpts): Promise<SearchResult[]>;
}
```

**Rationale:** Provider switch = new implementation, no service change. Offline fallback (ADR-009) is another implementation that returns `last_price` data from SQLite. Mock implementations for all providers exist from iteration 0 (scaffolding) — services are testable before real API keys are configured.

**Consequences:**
- No direct import of `yahoo-finance2` or `tavily` in services
- `QuoteProvider` implements batch fetching from the start
- ISIN resolution is three-stage: Yahoo search → for ISIN: OpenFIGI → Yahoo with returned ticker

---

## ADR-008: Prompt Versioning (2026-02-22)

**Context:** Prompts change over time. LLM outputs are not deterministic. Without versioning, it is unclear during an incident which prompt produced which stored data point.

**Decision:** Prompts as versioned TypeScript files (`prompts/research-quarterly.v1.ts`). Every generated data point references the version in the `prompt_version` field. Recording keys for tests contain `prompt_version` — a prompt update automatically forces re-recording (old key not found → playback test fails).

**Rationale:** Diagnostics during incidents: "Why do Q3 summaries look different from Q2?" → compare prompt version. The coupling of the recording key to `prompt_version` is the automatic cache invalidation: there is no manual step "delete recordings after prompt change" — the build reminds you.

**Consequences:**
- Prompt files are never overwritten; new version = new file (`research-quarterly.v2.ts`)
- Version string format: `{feature}-v{major}.{minor}`, e.g. `research-quarterly-v1.0`
- Recording key: `{promptVersion}/{ticker}-{period}` — deterministic, not dependent on prompt content

---

## ADR-009: Offline Degradation (2026-02-22)

**Context:** All three external APIs (LLM, Yahoo Finance, Tavily) can fail. The user must always be able to view their stored data — offline means read-only, not an error page.

**Decision:** Health probe on app startup (non-blocking, parallel) determines the initial feature status. Errors per adapter set the respective status to `degraded`. App startup is never blocked by any API failure. Frontend polls `/api/health` every 60s.

**Rationale:** The offline-first principle is a hard invariant: stored data is always available. External failures are normal for an analysis tool (markets are closed, AI services have maintenance windows). A blocked startup would lock the user out of their own data.

**Consequences:**
- `last_price` + `last_price_at` on `stocks` as offline fallback for prices; display: "As of: [date] — update failed"
- AI features disabled when `privacy_consent_given=false` or no `OPENAI_API_KEY` in `.env`
- Frontend OfflineBanner: green (invisible) / yellow ("Prices not current") / red ("Offline — stored data")
- `/api/health` response shape: `{ status, db, externals: {llm, yahoo, tavily}, queue: {pending, running}, budget: {usedPercent, limitEur}, lastBackup }`

---

## ADR-010: Parallel Analysis Perspectives + Sequential Summarizer (2026-02-22)

**Context:** REQ-008 describes a structured report from three perspectives with a consolidated summary. The PRD mentions "maximum N rounds (default 5)" as a discussion model. Timing: the UJ-004 window "30–60s" must be met.

**Decision:** 2-phase implementation instead of N debate rounds:
- **Phase 1 (parallel, ~15s):** Fundamental analyst, moat expert, bear perspective analyze the same stored data base independently via `completeBatch()`
- **Phase 2 (sequential, ~10s):** Summarizer agent generates consensus/dissent summary from the three perspective outputs

```
[Data base] → parallel → [Fundamental Analyst]  ──┐
                       → [Moat Expert]          ──┼→ [Summarizer] → Report
                       → [Bear Perspective]      ──┘
```

**Rationale:** The three perspectives access identical data — they have no mutual dependencies, parallelization is correct. Consensus and dissent points are identified by the summarizer from the three outputs; this does not require a sequential debate. Timing: ~25s instead of ~55s for fully sequential. `completeBatch()` in the LLMGateway reserves the budget for all three calls upfront (see ADR-003). The `max_rounds` field remains in the schema for phase 2 (optional debate format), but is semantically unused in V1.

**Consequences:**
- `rounds_completed` on `analysis_reports` is always `1` in V1
- User can cancel a running analysis; both phases are terminated; partial result saved
- Gate for analysis button: ≥2 quarters with `status='complete'`; data gaps appear as `dataGaps` array in perspective JSONs

**Restricts:** REQ-008 — the PRD concept "maximum N rounds (configurable, default 5)" is implemented in V1 as a fixed 2-phase pattern, not as a configurable debate loop.

---

## ADR-011: FTS5 Synchronization via SQLite Trigger (2026-02-22)

**Context:** REQ-005 requires full-text search across all stored data as well as cross-stock search. FTS5 is a virtual SQLite table with its own storage. New content from `research_items` and `analysis_reports` must reliably land in the search index.

**Decision:** SQLite triggers automatically synchronize data from source tables into `search_documents` (materialized bridge) and then into the FTS5 virtual table `search_index`. Application code does not execute any `INSERT INTO search_index` calls.

**Rationale:** Manual sync in service code gets forgotten with every new data type. SQLite triggers guarantee consistency structurally and atomically — within the same transaction as the triggering write. The `search_documents` bridge table is necessary because FTS5 content tables do not allow normal JOINs: cross-stock search (`search_index JOIN search_documents JOIN stocks`) is thus possible.

**Consequences:**
- Three triggers: `research_ai` (AFTER INSERT, only when `is_current=1`), `analysis_ai` (AFTER UPDATE, only when `status='complete'`), `research_supersede` (AFTER UPDATE, when `is_current=0` → DELETE from `search_documents`)
- Cross-stock search: `SELECT s.ticker, sd.* FROM search_index JOIN search_documents sd USING(rowid) JOIN stocks s ON sd.stock_id = s.id WHERE search_index MATCH ?`
- Performance target (REQ-005): search < 3s with > 1,000 stored documents

---

## ADR-012: Privacy Consent Before First LLM Call (2026-02-22)

**Context:** Tickers, time periods, and research results are sent to OpenAI and Tavily. The PRD contains no explicit privacy requirement, but sending user data to external services without knowledge and consent is unacceptable.

**Decision:** `settings.privacy_consent_given` must be `true` before the LLMGateway allows an external call. First-start dialog (modal, blocking) informs about the data flows. Consent is permanently stored in `settings` — no dialog on every startup.

Dialog text: *"This app sends stock tickers and time periods to OpenAI and Tavily for research and analysis. Purchase data, share quantities, and personal data are never sent."*

**Rationale:** The architectural placement in the LLMGateway guarantees complete enforcement — no service can bypass the check. Purchase data (`shares`, `price`, `fees`) is structurally never embedded in LLM prompts as a gateway invariant, regardless of consent status.

**Consequences:**
- Without consent: dashboard and all read features work fully; AI features show "Available only after consent"
- Settings page allows consent withdrawal; LLM features are immediately disabled afterwards
- Pre-commit hook (`secretlint`) scans prompt files for accidental secrets

**Restricts:** REQ-003 (automatic research on new addition), REQ-007 (AI-generated moat assessment), REQ-008 (AI analysis report) — all are only active after explicit consent.

---

## ADR-013: Retry with Exponential Backoff — No Circuit Breaker (2026-02-22)

**Context:** Three external APIs can fail transiently. The PRD requires max. 3 automatic retries (REQ-003). A formal circuit breaker with state machine (`closed/half-open/open`) was discussed and rejected.

**Decision:** Simple `withRetry` with exponential backoff. No global circuit breaker state. Fallback behavior is defined per adapter.

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    maxRetries: number;          // Default: 3
    backoffMs: number[];         // [1000, 3000, 9000]
    retryOn?: (err: Error) => boolean;
    onRetry?: (attempt: number, err: Error) => void;
  }
): Promise<T>
```

**Rationale:** Single user, manual triggers, 5–20 API calls per session — a circuit breaker practically never reaches its `half-open` state at this usage frequency. A correct implementation (~200–300 lines + state persistence + tests) is disproportionate to the benefit. On a real API failure, the error badge shows the status after the first retry cycle; the user decides. Retries are recorded as separate `cost_log` entries (`operation_type='retry'`); the upfront cost estimate includes a 1.5× buffer.

**Consequences:**
- Fallback per adapter: Yahoo → `last_price` + warn badge; LLM → error status + retry button; Tavily → partial results with status `partial`
- Phase 2 (optional background cron job): circuit breaker can be retrofitted locally at that point
- `busy_timeout = 5000` as SQLite safety net — no retry pattern needed for DB operations

---

## ADR-014: Env Validation with Zod on App Startup (2026-02-22)

**Context:** Missing or incorrectly formatted environment variables lead to hard-to-diagnose runtime errors. API keys are optional (degraded mode), but other values need sensible defaults.

**Decision:** Zod schema parses `process.env` synchronously as the first step on startup in `src/server/infra/env.ts`. Missing API keys are not a fatal error.

```typescript
const envSchema = z.object({
  OPENAI_API_KEY:     z.string().min(1).optional(),
  TAVILY_API_KEY:     z.string().min(1).optional(),
  PORT:               z.coerce.number().default(3000),
  DB_PATH:            z.string().default('./data/portfolio.db'),
  NODE_ENV:           z.enum(['development','production','test']).default('development'),
  LOG_LEVEL:          z.enum(['debug','info','warn','error']).default('info'),
  MONTHLY_BUDGET_EUR: z.coerce.number().positive().default(20),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
```

**Rationale:** Type-safe `process.env` parsing prevents silent configuration errors. Missing `OPENAI_API_KEY` → app starts in degraded mode with a clear UI notice instead of a cryptic error on the first LLM call. `.env.example` documents all variables with comments.

**Consequences:**
- Keys are never cached — every LLM call reads fresh from `env` (supports key rotation)
- `POST /api/settings/reload-env`: reads keys fresh from `process.env` without app restart (for key rotation in a running instance)
- All API keys are never exposed in logs, DB, frontend responses, or LLM prompts

---

## ADR-015: Startup Sequence and Graceful Shutdown (2026-02-22)

**Context:** Startup and stop behavior must be deterministic and crash-safe. Unclear ordering creates hard-to-diagnose errors. Only real infrastructure failures (corrupt DB, port in use) should block startup.

**Decision:**

**Startup Sequence (`src/server/index.ts`):**

```
1. Parse env (Zod)
   → Schema violation (invalid types): Exit 1

2. Open SQLite + set PRAGMAs
   → DB file does not exist: create + migrate
   → DB file corrupt: restore last backup, warn log, continue
   → PRAGMA failed: Exit 1

3. Create backup (BEFORE migration)
   → No storage: warn log, no exit

4. Run Drizzle migrations
   → Error: Exit 1, backup path in error message

5. Zombie recovery (idempotent, not an error case)
   → research_items: status='running' → 'pending'
   → analysis_reports: status='running' → 'pending'

6. Health probe (parallel, non-blocking)
   → LLM / Yahoo / Tavily one lightweight call each
   → Error: warn + feature status 'degraded' — NO exit

7. Fastify listen(127.0.0.1, PORT)
   → Port in use: Exit 1, message "Port {PORT} already in use"

8. Log: "Portfolio Manager ready — http://127.0.0.1:{PORT}"
   → List degraded notices: "⚠ OpenAI not reachable — AI features disabled"
```

**Graceful Shutdown (SIGINT / SIGTERM):**

```
1. Fastify.close() — reject new requests
2. Research queue: drain max 10s
   → Timeout: running jobs → status='pending', partial results saved via UPSERT
3. Close SSE connections
4. Create backup (only if write operations occurred since last backup)
5. Close SQLite connection
6. Exit 0
```

**Logging convention (pino):**

| Level | Usage |
|---|---|
| `error` | Unhandled error, fatal startup error, migration failed |
| `warn` | Degraded state, retry attempt, 80% budget threshold, API not reachable |
| `info` | Business event: stock added, research started/completed, analysis generated |
| `debug` | SQL query time, HTTP request, token count, cache hit/miss |

Never in logs: API keys, purchase data, full prompt texts or LLM responses, personal data.

**Security configuration:** Fastify with `@fastify/helmet` (security headers), rate limiting (10 req/s per route, protection against local malware/extensions), CORS only `127.0.0.1:3000`. Input validation via Fastify JSON Schema for all API inputs: ticker alphanumeric max 10 characters, ISIN exactly 12 alphanumeric, numeric range checks.

**Consequences:**
- `buildApp()` in `app.ts` is testable without `listen()` — Fastify `.inject()` does not need a network stack
- Only DB errors and port conflicts are fatal; all external API failures never are

---

## ADR-016: Type Flow from Drizzle Schema to Client (2026-02-22)

**Context:** Drizzle generates TypeScript types from the schema. Without an explicit derivation strategy, three separate type definitions arise (DB, API route, client) that must be manually synchronized. Schema changes then do not propagate automatically.

**Decision:** `src/shared/types.ts` as single source of truth. All types are derived from the Drizzle schema; API response types are composed derivations, not manual interfaces.

```typescript
// src/shared/types.ts
import type { InferSelectModel } from 'drizzle-orm';
import type { stocks, researchItems, metrics } from '../server/db/schema';

export type Stock       = InferSelectModel<typeof stocks>;
export type ResearchItem = InferSelectModel<typeof researchItems>;
export type Metric      = InferSelectModel<typeof metrics>;

// API response types as derivations
export type StockWithQuote = Stock & {
  currentPrice:     number | null;
  priceTimestamp:   string | null;
  delayed:          boolean;
};

export type DepotOverview = {
  stocks:                 StockWithQuote[];
  lastVisit:              string | null;
  changesSinceLastVisit:  ChangeSummary;
};
```

**Rationale:** Schema change → TypeScript errors in all consumers → no silent type drift. Without this pipeline, an AI agent will inevitably duplicate types during iterative implementation and create inconsistent states on schema changes.

**Consequences:**
- `tsconfig.json` configures `paths: { "@shared/*": ["src/shared/*"] }`
- `vite.config.ts` configures `resolve.alias: { '@shared': path.resolve(__dirname, 'src/shared') }`
- Client imports: `import type { Stock } from '@shared/types'`
- No `@types/` package needed, no code generator other than Drizzle itself

---

## ADR-017: Testing Strategy (2026-02-22)

**Context:** LLM calls in tests must be reproducible without real API keys. Contract tests must automatically verify PRD requirements. Unit and integration tests must have separate feedback loops. CI must not incur API costs.

**Decision:** Four test levels with explicitly separate configs:

| Level | Tool | Config | Trigger | Goal |
|---|---|---|---|---|
| Contract | Vitest | `vitest.config.ts` | Before implementation (TDD), after API change | PRD verification, API stability |
| Unit | Vitest | `vitest.config.ts` | After every code change | Business logic, calculations, prompt builders |
| Integration | Vitest | `vitest.config.integration.ts` | After every completed REQ | API routes + SQLite + mock providers |
| E2E | Playwright (workers=1) | `playwright.config.ts` | After UJ-relevant changes | User journeys against full stack |

**Recording pattern for LLM tests:**

```
npm run test              → Playback from __recordings__/ (free, deterministic)
LLM_RECORD=true npm test  → Real calls + recording into __recordings__/
```

Recording key: `{promptVersion}/{ticker}-{period}` — deterministic, not dependent on prompt content (which contains stock-specific data that varies between test runs). Recordings are committed to Git — CI does not need API keys.

**Contract test example:**

```typescript
// tests/contracts/depot.contract.test.ts
describe('PRD Verification REQ-001', () => {
  test('POST /api/depot → Response shape', async () => {
    const app = await createTestApp();
    const res = await app.inject({
      method: 'POST', url: '/api/depot',
      payload: { ticker: 'AAPL', exchange: 'NASDAQ' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      id:       expect.any(String),
      ticker:   'AAPL',
      exchange: 'NASDAQ',
      addedAt:  expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });
});
```

**Integration test setup:**

```typescript
// tests/setup.ts
export function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: './src/server/db/migrations' });
  return db;
}

export async function createTestApp(opts?: { seed?: string }) {
  const db = createTestDb();
  if (opts?.seed) await applySeed(db, opts.seed);
  return buildApp({ db, providers: mockProviders });
}
```

**Vitest integration configuration:**

```typescript
// vitest.config.integration.ts
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.integration.test.ts'],
    globalSetup: ['tests/setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },  // SQLite isolation
  },
});
```

**Consequences:**
- `npm run validate` is the agent heartbeat: typecheck + lint + unit + contract + integration + build — red = REQ not completed
- Contract tests are written before implementation (TDD anchor for every API endpoint)
- Agent workflow per REQ: contract test → red → implementation → green → integration test → green → validate

---

## ADR-018: Client Routing and Error Boundaries (2026-02-22)

**Context:** The SPA needs a routing scheme. Render errors in one component must not crash the entire dashboard or the entire app — especially relevant because `yahoo-finance2` can deliver inconsistent response shapes for different markets.

**Decision:** `react-router-dom v7` with four explicitly configured routes. Error boundaries at route level and at `StockCard` level.

```
/                           → Dashboard.tsx
/stock/:id                  → StockDetail.tsx  (Timeline + Metrics + Moat + Analysis)
/stock/:id/analysis/:aId    → AnalysisReport.tsx
/settings                   → Settings.tsx  (Budget, API keys, cost overview, privacy)
```

```tsx
// App.tsx
<Routes>
  <Route path="/" element={
    <RouteErrorBoundary><Dashboard /></RouteErrorBoundary>
  }/>
  <Route path="/stock/:id" element={
    <RouteErrorBoundary><StockDetail /></RouteErrorBoundary>
  }/>
  ...
</Routes>

// StockCard is additionally wrapped with its own boundary:
<StockCardErrorBoundary key={stock.id}>
  <StockCard stock={stock} />
</StockCardErrorBoundary>
```

**Rationale:** 4 routes, explicit configuration — no file-based routing needed (that would be TanStack Router or Next.js complexity for minimal benefit). A crash in the metrics component must not kill the dashboard; a faulty XETRA price response must not destroy the AAPL card.

**Consequences:**
- Vite dev proxy: `/api/*` → `http://127.0.0.1:3001`; SSE proxy with explicitly set `Accept: text/event-stream` header via `configure` callback
- `@shared` alias configured in `vite.config.ts` under `resolve.alias` and in `tsconfig.json` under `paths` — both must be consistent

---

## ADR-019: "Since Last Visit" Algorithm (2026-02-22)

**Context:** REQ-006 and UJ-002 require a contextual summary when the dashboard is opened after a pause. The algorithm has a critical detail: the baseline timestamp must only be updated after the data is loaded, not when opening.

**Decision:** `settings.last_dashboard_visit` stores the timestamp of the last visit. `stocks.price_at_last_visit` stores the price as a baseline for the price comparison. Timestamp update occurs after the data has loaded.

```typescript
async function computeSinceLastVisit(lastVisit: Date): Promise<SinceLastVisit> {
  const newResearch = await db.select()
    .from(researchItems)
    .where(and(
      gt(researchItems.fetchedAt, lastVisit.toISOString()),
      eq(researchItems.isCurrent, 1)
    ));

  const priceChanges = await getStocksWithPriceChange({
    since: lastVisit,
    thresholdPercent: 5,
    // Comparison: currentPrice vs. price_at_last_visit
  });

  // Update AFTER loading — not on open.
  // Otherwise "new" entries are lost immediately on page refresh.
  await db.update(settings)
    .set({ value: new Date().toISOString() })
    .where(eq(settings.key, 'last_dashboard_visit'));

  // Save price as new baseline
  for (const stock of allStocks) {
    await db.update(stocks)
      .set({ priceAtLastVisit: stock.lastPrice })
      .where(eq(stocks.id, stock.id));
  }

  return { newResearch, priceChanges, lastVisit };
}
```

**Consequences:**
- Price comparison: `(currentPrice - price_at_last_visit) / price_at_last_visit * 100 >= 5`
- No cron job — lazy refresh on app start when a stock's research is > 30 days old and a new quarter is available
- First visit: `last_dashboard_visit` not set → banner "Welcome!" instead of "Since last visit"

---

## Implementation Order

```
Iteration 0: Scaffolding  [BLOCKER for everything else]
  → package.json (all dependencies), TypeScript strict, Vite proxy config
  → Fastify skeleton: index.ts (listen) + app.ts (buildApp, testable)
  → Complete Drizzle schema + all migrations + FTS5 triggers
  → SQLite init (WAL, Pragmas, Auto-Migrate, backup logic)
  → LLMGateway skeleton (mock provider, CostGuard interface, recording infrastructure)
  → All adapter interfaces + mock implementations (QuoteProvider, WebSearchProvider)
  → React app shell (Router, QueryClient, empty dashboard)
  → src/shared/types.ts with Drizzle derivations
  → Health endpoint, Zod env validation, privacy consent placeholder (Settings)
  → Contract test template, Vitest configs (Unit + Integration), Playwright config
  → ESLint, Prettier, package-lock.json committed
  GATE: npm run validate → green; app starts; /api/health responds with HTTP 200

Iteration 1: REQ-001 + REQ-002  (Depot + Quotes)
  → Contract tests for /api/depot and /api/depot/:id/quote (TDD anchor, first)
  → DepotService + QuoteService + YahooQuoteProvider (batch fetch)
  → StockSearch autocomplete (debounce, fuzzy match, OpenFIGI for ISIN)
  → Dashboard base layout, StockCard with Error Boundary
  GATE: Contract tests green + E2E (UJ-001 partial)

Iteration 2: REQ-003  (Web research)
  → Contract tests for /api/depot/:id/research
  → TavilySearchProvider + real LLMGateway + CostGuard live
  → ResearchService + research queue + SSE status events
  → is_current + supersedes logic + verify FTS5 triggers
  → Create first LLM recordings (LLM_RECORD=true npm run test:record)
  → Privacy consent dialog (first start, modal)
  GATE: Contract tests + integration + E2E (UJ-001 complete)

Iteration 3: REQ-004  (Metrics)
  → Contract tests for /api/depot/:id/metrics
  → MetricsService (generateObject() with Zod schema → type-safe extraction)
  → MetricsTable + MiniChart + trend indicators + anomaly highlighting (≥20%)
  GATE: Contract tests + E2E (UJ-003 partial)

Iteration 4: REQ-005  (Timeline + Search)
  → SearchService (FTS5 via search_documents JOIN)
  → Timeline component with quarter anchors, empty quarters explicitly marked
  → Filter by data type, full-text search, cross-stock search
  GATE: Performance test (< 3s with 1,000 documents)

Iteration 5: REQ-006  (Dashboard)
  → Attention sorting (new data, anomalies, price > 5%)
  → "Since last visit" algorithm (ADR-019)
  → OfflineBanner (polling /api/health every 60s), onboarding notice
  GATE: E2E (UJ-002)

Iteration 6: REQ-009  (Cost UI)
  → Budget settings in settings table, CostBadge component
  → Cost overview page (day/week/month), 80% warning via SSE
  GATE: Contract tests for /api/costs/summary

Iteration 7: REQ-007  (Moat)
  → MoatService + LLM-generated initial assessment
  → User overrides with change history (supersedes pattern)
  GATE: Contract tests + E2E

[GATE: REQ-008a — test click prototype with 3–5 users, manual approval required]

Iteration 8a: REQ-008a  (Analysis UI prototype)
  → AnalysisReport component with static dummy data
  → No backend, no LLM calls
  OUTPUT: Clickable prototype for user tests

Iteration 8b: REQ-008b  (Analysis backend)  [ONLY after prototype validation]
  → AnalysisService: phase 1 parallel (completeBatch()) + phase 2 summarizer
  → Contract tests + timeline archiving
  GATE: Contract tests + E2E (UJ-004)

Iteration 9: REQ-010  (Transactions/Performance) — P2
```

---

## Architecture Invariants

Checklist for every iteration — violations are release blockers:

1. **No LLM call outside the LLMGateway.** No service imports `openai`, `@anthropic-ai/sdk`, or `ai` directly.
2. **No external API call without an interface.** Yahoo, Tavily, OpenFIGI — everything behind adapter interfaces; no direct import of `yahoo-finance2` in services.
3. **`prompt_version` on every generated data point.** No LLM output without a version stamp.
4. **`is_current` flag on versioned entities.** No blind UPSERT; always a version chain with `supersedes` FK.
5. **FTS5 sync via trigger, not application code.** No manual `INSERT INTO search_index` in service code.
6. **Privacy consent before first external LLM call.** LLMGateway checks `settings.privacy_consent_given` synchronously.
7. **Record costs even on cancellation.** No cancelled LLM call without a `cost_log` entry (`completed=0`).
8. **`127.0.0.1`, not `0.0.0.0`.** Fastify binds exclusively to loopback.
9. **Content is Markdown, not HTML.** `research_items.content` consistently structured for future embedding pipeline (phase 2).
10. **Backup before migration.** Automatic, no manual action required.
11. **`npm run validate` green before every completed REQ.** Typecheck + lint + unit + contract + integration + build.
12. **Purchase data never in LLM prompts.** `shares`, `price`, `fees` are architecturally never sent to external APIs.
13. **Write contract tests before implementation.** TDD anchor for every API endpoint defined before the first service code is written.
14. **Derive types from Drizzle, do not define manually.** `src/shared/types.ts` as single source of truth.

---

## Contradiction Resolutions

| # | Contradiction | Resolution | Consensus |
|---|---|---|---|
| W1 | REQ-005 empty quarters vs. REQ-008 agent data base | Gate: ≥2 quarters `status=complete` for analysis button; gaps as `dataGaps` array in perspective JSONs | All three |
| W2 | REQ-009 P1 vs. costs from first research (REQ-003) | CostGuard as LLMGateway infrastructure from iteration 0; REQ-009 only adds the UI | All three |
| W3 | UJ-001 "60s" vs. 4 quarterly reports | Streaming UX: base data visible < 5s, quarters delivered progressively via SSE | All three |
| W4 | REQ-003 auto-research vs. REQ-009 cost transparency | Add dialog shows estimate ("up to 0.12 EUR incl. retry buffer") | All three |
| W5 | "No cron job" vs. keeping "since last visit" current | Lazy refresh on app start when research > 30 days old and new quarter available | Architect |
| W6 | REQ-006 "375px" vs. data density (REQ-004, REQ-007) | Mobile: compact cards with top-3 metrics; drill-down scrollable | All three |
| W7 | Privacy missing from PRD | First-start dialog; no purchase data to LLM; no tracking (ADR-012) | All three |
| W8 | Migration/update strategy missing from PRD | Auto-migrate on startup; backup BEFORE migration; additive schema changes only | All three |
| W9 | REQ-003 "Retry 3×" vs. REQ-009 cost transparency | Cost estimate with 1.5× buffer; retries as separate `cost_log` entries (`operation_type='retry'`) | Architect + DevOps |
| W10 | UNIQUE constraint vs. supersedes on research_items | Partial index `WHERE is_current = 1` — resolves the constraint problem structurally (ADR-006) | All three |
| W11 | FTS5 sync mechanism unspecified | SQLite triggers + `search_documents` bridge as materialized index (ADR-011) | All three |
| W12 | CostGuard race condition on parallel analysis calls | `completeBatch()` reserves total budget atomically upfront (ADR-003, ADR-010) | Architect + SenDev |
