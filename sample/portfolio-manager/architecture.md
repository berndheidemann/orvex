# Architektur-Entscheidungen

> Monolithischer Full-Stack-Prozess (Fastify 5 + React 19/Vite 6 + SQLite WAL) mit explizitem LLMGateway, Interface-basierten Adaptern und Offline-First-Verhalten — lauffähig mit einem einzigen Befehl.

## Überblick

Der Portfolio Manager ist ein Single-User-Werkzeug, das als monolithischer Node.js 22-Prozess lokal ausgeführt wird. Fastify 5 bedient sowohl die REST-API (inkl. SSE) als auch die statischen Assets der React-19-SPA; SQLite 3 mit WAL-Modus ist die einzige Persistenzschicht ohne externe Infrastruktur. Alle LLM-Calls laufen ausschließlich durch einen zentralen `LLMGateway`-Singleton, der CostGuard, Token-Logging, Prompt-Versionierung und Provider-Abstraktion vereint. Die Architektur priorisiert Einfachheit und Testbarkeit — über ein Recording-Pattern für LLM-Calls und Contract-Tests gegen jede PRD-Verifikationsvorgabe — über abstrakte Flexibilität. Vollständige Offline-Funktionalität für gespeicherte Daten ist eine harte Invariante; externe API-Ausfälle degradieren einzelne Features, blockieren aber nie den App-Start.

## Tech-Stack

| Schicht | Technologie | Begründung |
|---|---|---|
| Runtime | Node.js 22 LTS + TypeScript 5.7 strict | LTS-Stabilität; TypeScript strict ab Tag 1 verhindert Typ-Drift |
| Backend | Fastify 5 | Performant, schema-validiert, pino-nativ, Plugin-System für saubere Modularität |
| Frontend | React 19 + Vite 6 (SPA) | Concurrent-Features; Vite für schnelles HMR und optimierten Build |
| Datenbank | SQLite 3 (WAL) via better-sqlite3 | Zero-Infrastruktur; WAL erlaubt concurrent Reads während Research-Writes; synchron — kein Serializer nötig |
| ORM | Drizzle ORM + drizzle-kit | TypeScript-First, Schema als Single Source of Truth für alle Typen |
| LLM-Abstraktion | Vercel AI SDK 4.x (innerhalb LLMGateway) | `generateObject()` mit Zod-Schema eliminiert manuelles JSON-Parsing; Provider-Wechsel per Einzeiler |
| Web-Recherche | Tavily API hinter WebSearchAdapter | Qualitativ für Finanzrecherche; Interface erlaubt Austausch ohne Service-Änderung |
| Kurs-API | yahoo-finance2 hinter QuoteProvider | Kostenlos, Batch-Abruf mehrerer Ticker |
| ISIN-Lookup | OpenFIGI API (on-demand) | Kostenlos; dreistufig: Yahoo → OpenFIGI (ISIN→Ticker) → Yahoo |
| Styling | Tailwind CSS 4 + shadcn/ui | Utility-First, konsistente Komponenten ohne Design-Overhead |
| Client State | TanStack Query v5 | Server-State-Caching, Refetch-Logik, optimal für API-zentrische SPA |
| Client Routing | react-router-dom v7 | 4 explizite Routen, kein File-based Routing nötig |
| Charts | Recharts | Ausreichend für Mini-Charts und Kennzahlen-Historien |
| Status-Updates | Server-Sent Events (SSE) | Unidirektionaler Push für Research-Status; kein WebSocket-Overhead |
| Test (Unit/Contract) | Vitest 3 (`vitest.config.ts`) | Schnelle Feedback-Loop, kein I/O |
| Test (Integration) | Vitest 3 (`vitest.config.integration.ts`) | In-Memory-SQLite mit Migrationen, separater Pool |
| Test (E2E) | Playwright 1.50 (workers=1) | SQLite-safe, Full-Stack gegen echten Server |
| Logging | pino (Fastify-Default) + pino-roll | Strukturiertes JSON, Log-Rotation (max 50 MB, 3 Dateien, `data/logs/`) |
| Env-Validierung | Zod | Typsicheres Parsen von `process.env`; fehlende Keys → Degraded Mode statt Crash |

**Dissenz-Punkte (2:1-Mehrheitsentscheidungen):**
- **Vercel AI SDK vs. direkter OpenAI SDK:** Arch + SenDev für Vercel AI SDK innerhalb Gateway wegen `generateObject()`-Typsicherheit; DevOps für direkten SDK. → **Vercel AI SDK** (2:1).
- **Retry vs. Circuit Breaker:** Arch + SenDev für `withRetry`; DevOps hat Position in R3 revidiert. → **withRetry + Backoff** (Konsens R3).
- **DbWriter PQueue vs. `transaction()`:** Arch + SenDev gegen PQueue (synchrone Writes brauchen keinen Serializer); DevOps hält an PQueue fest. → **`transaction()` reicht** (2:1).

## Systemarchitektur

```
┌────────────────────────────────────────────────────────────────┐
│                     Browser (SPA)                              │
│  React 19 + TanStack Query + shadcn/ui + Recharts              │
│  react-router-dom v7 · SSE-Listener (Auto-Reconnect)           │
│  Error Boundaries (Route-Level + StockCard-Level)              │
│  OfflineBanner · PrivacyConsentDialog (einmalig, First Start)  │
└───────────────────────┬────────────────────────────────────────┘
                        │ HTTP + SSE  (127.0.0.1:3000)
┌───────────────────────▼────────────────────────────────────────┐
│         Fastify 5  (127.0.0.1:3000 ONLY)                       │
│                                                                │
│  API Routes (~10 Endpunkte, Fastify-Plugins)                   │
│  POST /api/depot · GET /api/search · GET /api/costs            │
│  GET|POST /api/depot/:id/research · /metrics · /moat           │
│  POST /api/depot/:id/analysis · GET /api/health                │
│  GET /api/depot/:id/history · GET /api/events (SSE)            │
│  POST /api/settings/reload-env                                 │
│                                                                │
│  Service Layer  (Constructor Injection, kein DI-Container)     │
│  DepotSvc · QuoteSvc · ResearchSvc · MetricsSvc                │
│  MoatSvc · AnalysisSvc · SearchSvc · CostSvc                  │
│                                                                │
│  Infrastructure Layer                                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ LLMGateway  (Singleton)                                  │  │
│  │  ├─ CostGuard        Budget-Check VOR jedem Call         │  │
│  │  ├─ Vercel AI SDK 4.x  generateText / generateObject     │  │
│  │  ├─ Token-Logging    → cost_log  (NACH jedem Call)       │  │
│  │  ├─ Model-Router     fast→gpt-4o-mini / capable→gpt-4o   │  │
│  │  ├─ completeBatch()  Budget vorab für parallele Calls     │  │
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
│  │ In-Process       │ │ Event-Bus für    │                     │
│  │ max 2 concurrent │ │ Status-Updates   │                     │
│  │ dedup 5-Min      │ │                  │                     │
│  └──────────────────┘ └──────────────────┘                     │
│                                                                │
│  DB (Drizzle ORM) → SQLite WAL + FTS5 Triggers                 │
│  Datei: data/portfolio.db  ·  Backups: data/backups/ (max 5)   │
└────────────────────────────────────────────────────────────────┘

Startup-Sequenz:
  .env (Zod) → SQLite + PRAGMAs → Backup → Migrate →
  Zombie-Cleanup → Health-Probe (non-blocking) → listen()

Graceful Shutdown (SIGINT / SIGTERM):
  Fastify.close() → Queue drain (max 10s) →
  Jobs → pending → SSE close → Backup → SQLite close → Exit 0
```

## Projektstruktur

```
portfolio_manager/
├── package.json                       # Einziges package.json
├── package-lock.json                  # Committed; npm ci in CI
├── tsconfig.json                      # Base: strict, paths: { @shared }
├── tsconfig.server.json               # extends base, target: ES2022
├── vite.config.ts                     # SPA build + dev proxy (/api → :3001)
├── vitest.config.ts                   # Unit- + Contract-Tests (kein I/O)
├── vitest.config.integration.ts       # Integration-Tests (In-Memory-SQLite)
├── playwright.config.ts               # E2E: webServer, workers=1, DB_PATH=test.db
├── drizzle.config.ts
├── .env.example
├── .gitignore                         # .env, data/, dist/, logs/
├── src/
│   ├── server/
│   │   ├── index.ts                   # listen() + Startup-Sequenz + Graceful Shutdown
│   │   ├── app.ts                     # buildApp() — testbar ohne listen()
│   │   ├── db/
│   │   │   ├── schema.ts              # Drizzle Schema (Single Source of Truth für Typen)
│   │   │   ├── client.ts              # SQLite init, WAL, Pragmas, Auto-Migrate, Backup
│   │   │   └── migrations/
│   │   ├── routes/                    # Fastify-Plugins, je eine Datei pro Ressource
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
│   │   │   ├── llm-gateway.recorder.ts   # Record/Playback für Tests
│   │   │   ├── web-search.ts          # Tavily hinter WebSearchProvider-Interface
│   │   │   ├── quote-adapter.ts       # Yahoo hinter QuoteProvider-Interface
│   │   │   ├── isin-resolver.ts       # OpenFIGI
│   │   │   ├── research-queue.ts      # In-Process Queue, max 2 concurrent
│   │   │   ├── sse-emitter.ts         # SSE Event-Bus
│   │   │   ├── env.ts                 # Zod-Env-Validierung
│   │   │   └── retry.ts               # withRetry() Utility
│   │   ├── prompts/                   # Versionierte Prompt-Dateien
│   │   │   ├── research-quarterly.v1.ts
│   │   │   ├── research-news.v1.ts
│   │   │   ├── moat-assessment.v1.ts
│   │   │   └── analysis-perspectives.v1.ts
│   │   └── shared/
│   │       └── errors.ts              # Domänen-Fehlerklassen
│   ├── client/
│   │   ├── index.html                 # Vite-Entrypoint
│   │   ├── main.tsx
│   │   ├── App.tsx                    # Router + QueryClientProvider
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── StockDetail.tsx        # Timeline + Kennzahlen + Moat + Analyse
│   │   │   └── Settings.tsx           # Budget, API-Keys, Kostenübersicht, Privacy
│   │   ├── components/
│   │   │   ├── ErrorBoundary.tsx      # Route-Level + StockCard-Level
│   │   │   ├── StockSearch.tsx  StockCard.tsx  Timeline.tsx
│   │   │   ├── MetricsTable.tsx  MiniChart.tsx  MoatRadar.tsx
│   │   │   ├── AnalysisReport.tsx  CostBadge.tsx  OfflineBanner.tsx
│   │   ├── hooks/
│   │   │   ├── useApi.ts              # TanStack Query Hooks
│   │   │   └── useSSE.ts              # SSE mit Auto-Reconnect
│   │   └── lib/
│   │       └── api-client.ts
│   └── shared/
│       └── types.ts                   # Drizzle-abgeleitete Typen (Server + Client)
├── data/                              # gitignored
│   ├── portfolio.db  backups/  logs/
├── tests/
│   ├── setup.ts                       # createTestDb(), createTestApp(), Seed-Fixtures
│   ├── contracts/                     # PRD-Verifikation als TDD-Anker
│   │   ├── depot.contract.test.ts  research.contract.test.ts
│   │   ├── metrics.contract.test.ts  costs.contract.test.ts
│   ├── __recordings__/                # LLM-Response-Recordings (committed, in Git)
│   │   ├── research/  analysis/  moat/
│   └── integration/
└── e2e/
    ├── fixtures.ts
    ├── dashboard.spec.ts  stock-detail.spec.ts  add-stock.spec.ts
```

## Datenmodell

```sql
-- ===== Kern =====

stocks (
  id                  TEXT PRIMARY KEY,   -- ULID
  ticker              TEXT NOT NULL,
  name                TEXT NOT NULL,
  exchange            TEXT NOT NULL,
  isin                TEXT,
  currency            TEXT NOT NULL,
  added_at            TEXT NOT NULL,
  last_visited_at     TEXT,              -- Letzter Klick auf Detailseite
  last_price          REAL,              -- Fallback bei API-Ausfall
  last_price_at       TEXT,
  price_at_last_visit REAL,              -- Baseline für "Seit letztem Besuch"-Vergleich
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

-- ===== Recherche =====

research_items (
  id             TEXT PRIMARY KEY,
  stock_id       TEXT REFERENCES stocks ON DELETE CASCADE,
  type           TEXT CHECK(type IN ('quarterly_report','news')),
  period         TEXT,                -- 'Q3 2024' (NULL für News)
  title          TEXT,
  content        TEXT NOT NULL,       -- Markdown (konsistent für spätere Embedding-Pipeline)
  source_url     TEXT,
  source_name    TEXT,
  fetched_at     TEXT NOT NULL,
  status         TEXT CHECK(status IN ('complete','partial','error')),
  error_detail   TEXT,
  prompt_version TEXT,                -- z.B. 'research-quarterly-v1.0'
  is_current     INTEGER DEFAULT 1,   -- 1 = aktiv, 0 = superseded
  supersedes     TEXT REFERENCES research_items,
  raw_data       TEXT                 -- JSON-Rohdaten
);

-- Partieller Unique Index: nur ein aktiver Eintrag pro Stock+Type+Period
CREATE UNIQUE INDEX idx_research_current
  ON research_items(stock_id, type, period)
  WHERE is_current = 1;

-- ===== Kennzahlen =====

metrics (
  id                 TEXT PRIMARY KEY,
  stock_id           TEXT REFERENCES stocks ON DELETE CASCADE,
  name               TEXT NOT NULL,
  quarter            TEXT NOT NULL,
  value              REAL,            -- NULL = nicht verfügbar (≠ 0)
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

-- ===== Burggraben =====

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
  API Error: Claude's response exceeded the 32000 output token maximum. To configure this behavior, set the CLAUDE_CODE_MAX_OUTPUT_TOKENS environment variable.Continuing from the data model (moat_assessments):

```sql
  prompt_version TEXT,
  supersedes     TEXT REFERENCES moat_assessments
);

-- ===== KI-Analyse =====

analysis_reports (
  id                 TEXT PRIMARY KEY,
  stock_id           TEXT REFERENCES stocks ON DELETE CASCADE,
  status             TEXT CHECK(status IN ('running','complete','cancelled','error')),
  started_at         TEXT NOT NULL,
  completed_at       TEXT,
  perspectives       TEXT,            -- JSON: [{role, content, datapointsReferenced, dataGaps}]
  summary            TEXT,
  consensus_points   TEXT,            -- JSON Array
  dissent_points     TEXT,            -- JSON Array
  rounds_completed   INTEGER DEFAULT 0,
  max_rounds         INTEGER DEFAULT 5,
  prompt_version     TEXT,
  estimated_cost_eur REAL,
  actual_cost_eur    REAL
);

-- ===== Kosten =====

cost_log (
  id             TEXT PRIMARY KEY,
  operation_type TEXT NOT NULL,       -- 'research' | 'analysis' | 'moat' | 'retry'
  stock_id       TEXT REFERENCES stocks,
  tokens_input   INTEGER NOT NULL,
  tokens_output  INTEGER NOT NULL,
  model          TEXT NOT NULL,
  estimated_eur  REAL NOT NULL,
  created_at     TEXT NOT NULL,
  completed      INTEGER DEFAULT 1    -- 0 = abgebrochen (anteilig erfasst)
);

-- ===== Volltextsuche =====

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
    'analysis', NULL, 'KI-Analyse', NEW.summary, NEW.completed_at);
  INSERT INTO search_index(rowid, title, body)
  VALUES (last_insert_rowid(), 'KI-Analyse', NEW.summary);
END;

-- Trigger: Superseded-Einträge aus Suchindex entfernen
CREATE TRIGGER research_supersede AFTER UPDATE ON research_items
WHEN NEW.is_current = 0
BEGIN
  DELETE FROM search_documents
    WHERE source_table = 'research_items' AND source_id = NEW.id;
END;

-- ===== App-State =====

settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL               -- JSON-String
);
-- Initiale Werte:
-- { key: 'last_dashboard_visit',   value: '"2025-01-01T00:00:00Z"' }
-- { key: 'budget_limit_eur',       value: '20' }
-- { key: 'privacy_consent_given',  value: 'false' }

-- ===== SQLite-Pragmas (beim DB-Open gesetzt) =====
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
```

---

## ADR-001: Monolithischer Full-Stack-Prozess (2026-02-22)

**Kontext:** Ein Analyse-Tool für Privatanleger, das lokal mit einem einzigen Befehl starten soll (REQ-006). Alternativen: Monorepo mit separaten Prozessen, Docker-Compose, Next.js als Full-Stack-Framework.

**Entscheidung:** Fastify 5 serviert API + statische Vite-Build-Assets in einem einzigen Node.js-Prozess auf `127.0.0.1:3000`. Kein Docker, kein Monorepo, kein Reverse Proxy. Im Dev-Modus laufen Vite (Port 5173) und Fastify (Port 3001) separat, verbunden über Vites `/api`-Proxy.

**Begründung:** `npm start` bedeutet ein Befehl, ein Prozess, ein Port. Für ein Single-User-Local-Tool ist jede Infrastruktur-Ebene über diesem Minimum reiner Overhead ohne Nutzen. Fastifys Plugin-System ermöglicht strukturierte Modularität ohne externe Build-Kopplung. `buildApp()` in `app.ts` ist von `listen()` in `index.ts` getrennt — das macht Fastify mit `.inject()` in Tests aufrufbar ohne Netzwerkstack.

**Konsequenzen:**
- `npm start` → `node dist/server/index.js`, bindet auf `127.0.0.1:3000`, serviert `dist/client/`
- `npm run dev` → `concurrently` startet `tsx watch src/server/index.ts` (Port 3001) und `vite` (Port 5173); SSE-Proxy braucht Header `Accept: text/event-stream` explizit gesetzt
- Build-Scripts:
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
- Playwright-Konfiguration: `reuseExistingServer: !process.env.CI`; Readiness-Check gegen `/api/health`, nicht gegen Root-URL; `DB_PATH=./data/test.db` via `env`-Feld im `webServer`-Block

---

## ADR-002: SQLite WAL-Modus mit better-sqlite3 (2026-02-22)

**Kontext:** Lokale Single-User-Persistenz ohne externe Infrastruktur. Anforderungen: concurrent Reads während laufender Research-Writes (mehrere Queue-Jobs gleichzeitig), zuverlässige ACID-Guarantees, FTS5 für Volltextsuche, Backup-Strategie.

**Entscheidung:** SQLite 3 mit WAL-Modus via `better-sqlite3`. Kein PQueue-Write-Serializer. Backup via SQLites `.backup()`-API vor jeder Migration. PRAGMA-Konfiguration wie im Datenmodell.

**Begründung:** `better-sqlite3` ist synchron — jeder `.run()`-Call blockiert bis zum Abschluss. In einem Single-Process-Node.js-Server können sich zwei synchrone Writes physisch nicht überlappen; `SQLITE_BUSY` tritt ausschließlich bei Mehrprozess-Szenarien auf, die hier nicht existieren. Ein PQueue-Wrapper um synchrone Calls erzeugt Promise-Overhead für ein nicht-existierendes Problem. Drizzles `transaction()`-Wrapper ist atomar und ausreichend. `PRAGMA busy_timeout = 5000` fängt den theoretischen Randfall (Playwright mit mehreren Workers gegen dieselbe DB) als Sicherheitsnetz ab. WAL-Modus ist Pflicht, weil Research-Queue-Writes und Dashboard-Reads gleichzeitig auftreten.

**Konsequenzen:**
- Automatisches Backup (`sqlite.backup(path)`) vor jeder Migration in `data/backups/`; Rotation auf max 5 Dateien
- Backup-Fehler: Warn-Log, kein Start-Abbruch
- Zombie-Recovery beim Start: `UPDATE research_items SET status='pending' WHERE status='running'` und analog für `analysis_reports`
- Crash-sichere partielle Ergebnisse durch UPSERT innerhalb jedes einzelnen Research-Schritts
- FTS5-Sync ausschließlich über SQLite-Trigger (kein manueller Sync-Code in Services), s. ADR-011

---

## ADR-003: LLMGateway als einziger Zugangspunkt zu LLM-Calls (2026-02-22)

**Kontext:** LLM-Calls verursachen Kosten, brauchen Versionierung, müssen in Tests ohne echte API-Keys reproduzierbar sein und dürfen Budget-Limits nicht überschreiten. Drei parallele Calls (REQ-008) erzeugen eine Race Condition am Budget-Limit.

**Entscheidung:** Singleton-Klasse `LLMGateway` in `src/server/infra/llm-gateway.ts` als einziger Export-Punkt für LLM-Operationen. Kein Service importiert `openai`, `@anthropic-ai/sdk` oder `ai` direkt. Drei öffentliche Methoden: `complete()`, `completeBatch()`, `estimateTokens()`.

```typescript
class LLMGateway {
  async complete(opts: LLMRequest): Promise<LLMResponse> { ... }

  // Reserviert Budget für alle Calls vorab — verhindert Race Condition
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

**Begründung:** Zentralisierung garantiert lückenlose Geltung von CostGuard (Budget-Check vor jedem Call), Token-Logging (nach jedem Call) und Recording-Pattern (für Tests). `completeBatch()` löst das Race-Condition-Problem bei drei parallelen Analyse-Calls: Das Gesamtbudget wird atomar vorab geprüft und reserviert — kein drittes Call schlägt durch, wenn das Budget nur für zwei reicht. Model-Router: `model: 'fast'` → gpt-4o-mini für strukturierte Extraktion; `model: 'capable'` → gpt-4o für qualitative Analyse.

**Konsequenzen:**
- Jeder LLM-Call protokolliert in `cost_log` — auch abgebrochene (`completed=0`, anteilig)
- `prompt_version` ist Pflichtparameter auf jedem Call; fehlt er, wirft der Gateway einen Fehler
- Recording-Mode via Env: `LLM_RECORD=true` → echte Calls + Aufzeichnung; `NODE_ENV=test` → Playback; `npm run dev` → Passthrough
- Kostenschätzung vor Start: 1,5×-Puffer für mögliche Retries; im UI als "bis zu X EUR" kommuniziert
- Privacy-Consent-Check: Gateway prüft `settings.privacy_consent_given` synchron vor jedem externen Call (s. ADR-012)

---

## ADR-004: Vercel AI SDK 4.x innerhalb des LLMGateway (2026-02-22)

**Kontext:** Wahl der LLM-Execution-Engine innerhalb des LLMGateway. Optionen: Vercel AI SDK 4.x vs. direkter `openai`-SDK. Der Gateway abstrahiert den Provider ohnehin — die Frage ist, was intern verwendet wird.

**Entscheidung:** Vercel AI SDK 4.x intern im `LLMGateway`. Nicht als globale Abhängigkeit sichtbar, nicht außerhalb des Gateway importiert.

**Begründung:** `generateObject()` mit Zod-Schema ist für Kennzahlen-Extraktion (REQ-003, REQ-004) entscheidend:

```typescript
// generateObject() → typsicheres Objekt, kein manuelles JSON.parse
const { object } = await generateObject({
  model: openai('gpt-4o-mini'),
  schema: z.object({
    revenue: z.number().nullable(),
    operatingMargin: z.number().nullable(),
    outlook: z.string(),
  }),
  prompt: extractionPrompt,
});
// object ist vollständig typsicher, Zod-validiert
```

Der direkte OpenAI SDK erfordert `response_format: { type: 'json_schema' }` + manuelles Parsen + manuelle Zod-Validierung — mehr Eigencode mit denselben Fehlerquellen. Provider-Wechsel bleibt ein Einzeiler (`createAnthropic()` statt `createOpenAI()`). Für Streaming-UX in Phase 2 liefert das AI SDK `streamText()` mit Token-Callbacks, ohne dass wir eigenes Chunking implementieren müssen.

**Konsequenzen:**
- Breaking Changes im Vercel AI SDK sind lokale Gateway-Refactorings, kein Impact auf Services
- `generateText()` für freie Texte (Moat-Einschätzungen, Analyse-Perspektiven); `generateObject()` für strukturierte Datenextraktion (Kennzahlen)

---

## ADR-005: In-Process Job Queue für Webrecherche (2026-02-22)

**Kontext:** Research-Jobs laufen asynchron und dürfen die UI nicht blockieren (REQ-003). Gleichzeitig sollen maximal 2 Jobs concurrent laufen, um API-Rate-Limits nicht zu triggern. Doppelte Requests für dieselbe Aktie müssen dedupliziert werden.

**Entscheidung:** Promise-basierte In-Process-Queue (`src/server/infra/research-queue.ts`) mit max. 2 concurrent Jobs. Deduplizierung: gleicher Stock + Typ + 5-Minuten-Fenster = Job wird ignoriert. SSE-Emitter sendet Status-Events pro Job-Fortschritt. Crash Recovery beim Start.

**Begründung:** Eine externe Queue (Redis, BullMQ) wäre Infrastruktur-Overkill für ein Single-User-Tool mit gelegentlichen Manual-Triggers. Die realistische Queue-Tiefe (max. 20 Aktien × 4 Quartale = 80 Jobs) passt bequem in den Prozess-Speicher. Partielle Ergebnisse werden per UPSERT nach jedem erfolgreich abgeschlossenen Sub-Task gespeichert — ein Job-Crash verliert nicht alle bereits abgerufenen Quartale.

**Konsequenzen:**
- Research-Status pro Aktie: `Recherche läuft` / `Aktuell` / `Teilweise geladen` / `Fehler bei [Quelle X]`
- Automatischer Retry bei transienten Fehlern: max 3×, exponentielles Backoff (1s/3s/9s) per `withRetry()`
- Fehlgeschlagene Quellen werden namentlich angezeigt, nicht generisch als "Fehler"
- Graceful Shutdown: Queue draint, max 10s; danach laufende Jobs → `status='pending'`, Teilergebnisse bereits gespeichert

---

## ADR-006: Research-Versionierung mit is_current + supersedes (2026-02-22)

**Kontext:** Re-Recherche soll alte Ergebnisse nicht überschreiben — die Timeline-Historie muss erhalten bleiben. Gleichzeitig muss garantiert werden, dass nur ein aktiver Eintrag pro Stock+Type+Period existiert. Ein normaler UNIQUE-Constraint würde beim Einfügen des neuen Eintrags brechen, solange der alte noch existiert.

**Entscheidung:** Soft-Delete-Pattern mit `is_current INTEGER DEFAULT 1`. Beim Re-Research innerhalb einer SQLite-Transaktion: alten Eintrag auf `is_current=0` setzen, neuen mit `is_current=1` und `supersedes=old.id` einfügen. Partieller Unique Index erzwingt Eindeutigkeit nur für aktive Einträge:

```sql
CREATE UNIQUE INDEX idx_research_current
  ON research_items(stock_id, type, period)
  WHERE is_current = 1;
```

**Begründung:** Der partielle Index ist die eleganteste SQLite-Lösung: Die Datenbank erzwingt die Constraint ohne Anwendungslogik, erlaubt aber mehrere Einträge mit gleichen Werten, solange nur einer aktiv ist. Gleiches Pattern gilt für `moat_assessments`. Timeline-Queries sind einfach (`WHERE is_current = 1`); Versions-Drill-Down zeigt alle Einträge ohne `is_current`-Filter.

**Konsequenzen:**
- Timeline zeigt immer `WHERE is_current = 1`
- Drill-Down: `WHERE stock_id = ? AND type = ? AND period = ? ORDER BY fetched_at DESC`
- FTS5-Trigger entfernt superseded Einträge automatisch aus dem Suchindex (s. ADR-011)
- `prompt_version` bleibt auf jedem Eintrag dauerhaft erhalten — auch auf superseded Rows

---

## ADR-007: Interface-basierte externe Adapter (2026-02-22)

**Kontext:** Drei externe APIs (yahoo-finance2, Tavily, OpenFIGI) müssen in Tests durch Mocks ersetzbar und in Production gegen alternative Anbieter austauschbar sein, ohne Services zu ändern.

**Entscheidung:** Alle externen APIs hinter TypeScript-Interfaces. Production-Implementierungen in `src/server/infra/`. Mock-Implementierungen in `tests/`. Interface-Injektion per Constructor in Services (kein DI-Container, explizite Verdrahtung in `buildApp()`).

```typescript
interface QuoteProvider {
  getQuote(ticker: string, exchange: string): Promise<Quote | null>;
  getQuotes(tickers: TickerExchange[]): Promise<Quote[]>;  // Batch von Anfang an
}

interface WebSearchProvider {
  search(query: string, opts: SearchOpts): Promise<SearchResult[]>;
}
```

**Begründung:** Provider-Wechsel = neue Implementierung, keine Service-Änderung. Offline-Fallback (ADR-009) ist eine weitere Implementierung, die `last_price`-Daten aus SQLite zurückgibt. Mock-Implementierungen für alle Provider existieren ab Iteration 0 (Scaffolding) — Services sind testbar, bevor echte API-Keys konfiguriert sind.

**Konsequenzen:**
- Kein direkter Import von `yahoo-finance2` oder `tavily` in Services
- `QuoteProvider` implementiert Batch-Abruf von Anfang an
- ISIN-Auflösung dreistufig: Yahoo-Suche → bei ISIN: OpenFIGI → Yahoo mit zurückgegebenem Ticker

---

## ADR-008: Prompt-Versionierung (2026-02-22)

**Kontext:** Prompts ändern sich über die Zeit. LLM-Outputs sind nicht deterministisch. Ohne Versionierung ist bei einem Incident unklar, welcher Prompt welchen gespeicherten Datenpunkt erzeugt hat.

**Entscheidung:** Prompts als versionierte TypeScript-Dateien (`prompts/research-quarterly.v1.ts`). Jeder generierte Datenpunkt referenziert die Version im Feld `prompt_version`. Recording-Key für Tests enthält `prompt_version` — ein Prompt-Update erzwingt automatisch Re-Recording (alter Key wird nicht gefunden → Playback-Test schlägt fehl).

**Begründung:** Diagnostik bei Incidents: "Warum sehen Q3-Zusammenfassungen anders aus als Q2?" → Prompt-Version vergleichen. Die Kopplung von Recording-Key an `prompt_version` ist die automatische Cache-Invalidierung: Es gibt keinen manuellen Schritt "Recordings löschen nach Prompt-Änderung" — der Build erinnert daran.

**Konsequenzen:**
- Prompt-Dateien werden niemals überschrieben; neue Version = neue Datei (`research-quarterly.v2.ts`)
- Versions-String-Format: `{feature}-v{major}.{minor}`, z.B. `research-quarterly-v1.0`
- Recording-Key: `{promptVersion}/{ticker}-{period}` — deterministisch, nicht vom Prompt-Inhalt abhängig

---

## ADR-009: Offline-Degradation (2026-02-22)

**Kontext:** Alle drei externen APIs (LLM, Yahoo Finance, Tavily) können ausfallen. Der Nutzer muss seine gespeicherten Daten immer einsehen können — Offline bedeutet Read-Only, nicht Fehlerseite.

**Entscheidung:** Health-Probe beim App-Start (non-blocking, parallel) bestimmt den initialen Feature-Status. Fehler pro Adapter setzen den jeweiligen Status auf `degraded`. Der App-Start wird durch keinen API-Ausfall blockiert. Frontend pollt `/api/health` alle 60s.

**Begründung:** Das Offline-First-Prinzip ist eine harte Invariante: Gespeicherte Daten sind immer verfügbar. Externe Ausfälle sind für ein Analyse-Werkzeug normal (Märkte haben geschlossen, KI-Dienste haben Wartungsfenster). Ein blockierter Start würde den Nutzer von seinen eigenen Daten aussperren.

**Konsequenzen:**
- `last_price` + `last_price_at` auf `stocks` als Offline-Fallback für Kurse; Anzeige: "Stand: [Datum] — Aktualisierung fehlgeschlagen"
- KI-Features deaktiviert wenn `privacy_consent_given=false` oder kein `OPENAI_API_KEY` in `.env`
- Frontend-OfflineBanner: grün (unsichtbar) / gelb ("Kurse nicht aktuell") / rot ("Offline — gespeicherte Daten")
- `/api/health` Response-Shape: `{ status, db, externals: {llm, yahoo, tavily}, queue: {pending, running}, budget: {usedPercent, limitEur}, lastBackup }`

---

## ADR-010: Parallele Analyse-Perspektiven + sequentieller Summarizer (2026-02-22)

**Kontext:** REQ-008 beschreibt einen strukturierten Bericht aus drei Perspektiven mit konsolidierter Zusammenfassung. Das PRD nennt "maximal N Runden (Default 5)" als Diskussionsmodell. Timing: Das UJ-004-Fenster "30–60s" muss eingehalten werden.

**Entscheidung:** 2-Phasen-Implementierung statt N Debattenrunden:
- **Phase 1 (parallel, ~15s):** Fundamentalanalyst, Burggraben-Experte, Bären-Perspektive analysieren unabhängig voneinander dieselbe gespeicherte Datenbasis via `completeBatch()`
- **Phase 2 (sequentiell, ~10s):** Summarizer-Agent erzeugt Konsens/Dissenz-Zusammenfassung aus den drei Perspektiv-Outputs

```
[Datenbasis] → parallel → [Fundamentalanalyst]  ──┐
                        → [Burggraben-Experte]  ──┼→ [Summarizer] → Bericht
                        → [Bären-Perspektive]   ──┘
```

**Begründung:** Die drei Perspektiven greifen auf identische Daten zu — sie haben keine gegenseitigen Abhängigkeiten, Parallelisierung ist korrekt. Konsens- und Dissenz-Punkte identifiziert der Summarizer aus den drei Outputs; das erfordert keine sequentielle Debatte. Timing: ~25s statt ~55s bei vollständig sequential. `completeBatch()` im LLMGateway reserviert Budget für alle drei Calls vorab (s. ADR-003). Das `max_rounds`-Feld bleibt im Schema für Phase 2 (optionales Debattenformat), ist in V1 aber semantisch unused.

**Konsequenzen:**
- `rounds_completed` auf `analysis_reports` ist in V1 immer `1`
- Nutzer kann laufende Analyse abbrechen; beide Phasen werden terminiert; Teilergebnis gespeichert
- Gate für Analyse-Button: ≥2 Quartale mit `status='complete'`; Datenlücken erscheinen als `dataGaps`-Array in den Perspektiv-JSONs

**Einschränkt:** REQ-008 — das PRD-Konzept "maximal N Runden (konfigurierbar, Default 5)" wird in V1 als festes 2-Phasen-Pattern implementiert, nicht als konfigurierbare Debattenschleife.

---

## ADR-011: FTS5-Synchronisation via SQLite-Trigger (2026-02-22)

**Kontext:** REQ-005 fordert Volltextsuche über alle gespeicherten Daten sowie übergreifende Suche über mehrere Aktien. FTS5 ist ein virtueller SQLite-Table mit eigenem Storage. Neue Inhalte aus `research_items` und `analysis_reports` müssen zuverlässig im Suchindex landen.

**Entscheidung:** SQLite-Trigger synchronisieren Daten automatisch von Quelltabellen in `search_documents` (materialisierte Brücke) und dann in den FTS5 Virtual Table `search_index`. Application-Code führt keinen `INSERT INTO search_index`-Call durch.

**Begründung:** Manueller Sync im Service-Code wird bei jedem neuen Datentyp vergessen. SQLite-Trigger garantieren Konsistenz strukturell und atomar — innerhalb derselben Transaktion wie der auslösende Write. Die `search_documents`-Brückentabelle ist notwendig, weil FTS5-Content-Tables keine normalen JOINs erlauben: übergreifende Suche (`search_index JOIN search_documents JOIN stocks`) ist damit möglich.

**Konsequenzen:**
- Drei Trigger: `research_ai` (AFTER INSERT, nur wenn `is_current=1`), `analysis_ai` (AFTER UPDATE, nur wenn `status='complete'`), `research_supersede` (AFTER UPDATE, wenn `is_current=0` → DELETE aus `search_documents`)
- Übergreifende Suche: `SELECT s.ticker, sd.* FROM search_index JOIN search_documents sd USING(rowid) JOIN stocks s ON sd.stock_id = s.id WHERE search_index MATCH ?`
- Performance-Ziel (REQ-005): Suche < 3s bei > 1.000 gespeicherten Dokumenten

---

## ADR-012: Privacy-Consent vor erstem LLM-Call (2026-02-22)

**Kontext:** Ticker, Zeiträume und Research-Ergebnisse werden an OpenAI und Tavily gesendet. Das PRD enthält keine explizite Datenschutz-Anforderung, aber das Senden von Nutzerdaten an externe Services ohne Kenntnis und Einwilligung ist inakzeptabel.

**Entscheidung:** `settings.privacy_consent_given` muss `true` sein, bevor der LLMGateway einen externen Call erlaubt. First-Start-Dialog (modal, blockierend) informiert über die Datenflüsse. Consent ist dauerhaft in `settings` gespeichert — kein Dialog bei jedem Start.

Dialog-Text: *"Diese App sendet Aktienticker und Zeiträume an OpenAI und Tavily für Recherche und Analyse. Kaufdaten, Stückzahlen und persönliche Daten werden niemals gesendet."*

**Begründung:** Die architektonische Platzierung im LLMGateway garantiert lückenlose Enforcement — kein Service kann die Prüfung umgehen. Kaufdaten (`shares`, `price`, `fees`) werden als Gateway-Invariante strukturell nie in LLM-Prompts eingebettet, unabhängig vom Consent-Status.

**Konsequenzen:**
- Ohne Consent: Dashboard und alle Read-Features funktionieren vollständig; KI-Features zeigen "Erst nach Einwilligung verfügbar"
- Settings-Seite erlaubt Consent-Widerruf; danach sind LLM-Features sofort deaktiviert
- Pre-Commit-Hook (`secretlint`) scannt Prompt-Dateien auf versehentliche Secrets

**Einschränkt:** REQ-003 (automatische Recherche bei Neuaufnahme), REQ-007 (KI-generierte Burggraben-Bewertung), REQ-008 (KI-Analysebericht) — alle sind erst nach expliziter Einwilligung aktiv.

---

## ADR-013: Retry mit exponentiellem Backoff — kein Circuit Breaker (2026-02-22)

**Kontext:** Drei externe APIs können transient ausfallen. Das PRD fordert max. 3 automatische Retries (REQ-003). Ein formaler Circuit Breaker mit Zustandsmaschine (`closed/half-open/open`) wurde diskutiert und abgelehnt.

**Entscheidung:** Einfaches `withRetry` mit exponentiellem Backoff. Kein globaler Circuit-Breaker-State. Fallback-Verhalten ist pro Adapter definiert.

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

**Begründung:** Single-User, manuelle Trigger, 5–20 API-Calls pro Session — ein Circuit Breaker erreicht bei dieser Nutzungsfrequenz seinen `half-open`-State praktisch nie. Eine korrekte Implementierung (~200–300 Zeilen + State-Persistence + Tests) ist unverhältnismäßig zum Nutzen. Bei echtem API-Ausfall zeigt das Fehlerbadge nach dem ersten Retry-Zyklus den Status; der Nutzer entscheidet. Retries werden als separate `cost_log`-Einträge (`operation_type='retry'`) erfasst; die Vorab-Kostenschätzung enthält einen 1,5×-Puffer.

**Konsequenzen:**
- Fallback pro Adapter: Yahoo → `last_price` + Warn-Badge; LLM → Fehlerstatus + Retry-Button; Tavily → partielle Ergebnisse mit Status `partial`
- Phase 2 (optionaler Hintergrund-Cronjob): Circuit Breaker kann zu diesem Zeitpunkt lokal nachgerüstet werden
- `busy_timeout = 5000` als SQLite-Sicherheitsnetz — kein Retry-Pattern für DB-Operationen nötig

---

## ADR-014: Env-Validierung mit Zod beim App-Start (2026-02-22)

**Kontext:** Fehlende oder falsch formatierte Umgebungsvariablen führen zu schwer diagnostizierbaren Laufzeitfehlern. API-Keys sind optional (Degraded Mode), aber andere Werte brauchen sinnvolle Defaults.

**Entscheidung:** Zod-Schema parst `process.env` synchron als ersten Schritt beim Start in `src/server/infra/env.ts`. Fehlende API-Keys sind kein fataler Fehler.

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

**Begründung:** Typsicheres `process.env`-Parsen verhindert stille Konfigurationsfehler. Fehlender `OPENAI_API_KEY` → App startet im Degraded Mode mit klarem UI-Hinweis statt kryptischem Fehler beim ersten LLM-Call. `.env.example` dokumentiert alle Variablen mit Kommentaren.

**Konsequenzen:**
- Keys werden nie gecacht — jeder LLM-Call liest aus `env` frisch (unterstützt Key-Rotation)
- `POST /api/settings/reload-env`: liest Keys neu aus `process.env` ohne App-Neustart (für Key-Rotation im laufenden Betrieb)
- Alle API-Keys werden niemals in Logs, DB, Frontend-Responses oder LLM-Prompts exponiert

---

## ADR-015: Startup-Sequenz und Graceful Shutdown (2026-02-22)

**Kontext:** Start- und Stop-Verhalten müssen deterministisch und crash-sicher sein. Unklare Reihenfolge erzeugt schwer diagnostizierbare Fehler. Nur echte Infrastruktur-Fehler (korrupte DB, Port belegt) sollen den Start blockieren.

**Entscheidung:**

**Startup-Sequenz (`src/server/index.ts`):**

```
1. env (Zod) parsen
   → Schema-Verletzung (ungültige Typen): Exit 1

2. SQLite öffnen + PRAGMAs setzen
   → DB-Datei existiert nicht: erstellen + migrieren
   → DB-Datei korrupt: letztes Backup wiederherstellen, Warn-Log, weitermachen
   → PRAGMA fehlgeschlagen: Exit 1

3. Backup erstellen (VOR Migration)
   → Kein Speicher: Warn-Log, kein Exit

4. Drizzle-Migrationen ausführen
   → Fehler: Exit 1, Backup-Pfad in Fehlermeldung

5. Zombie-Recovery (idempotent, kein Fehlerfall)
   → research_items: status='running' → 'pending'
   → analysis_reports: status='running' → 'pending'

6. Health-Probe (parallel, non-blocking)
   → LLM / Yahoo / Tavily je 1 leichtgewichtiger Call
   → Fehler: warn + Feature-Status 'degraded' — KEIN Exit

7. Fastify listen(127.0.0.1, PORT)
   → Port belegt: Exit 1, Meldung "Port {PORT} bereits belegt"

8. Log: "Portfolio Manager bereit — http://127.0.0.1:{PORT}"
   → Degraded-Hinweise auflisten: "⚠ OpenAI nicht erreichbar — KI-Features deaktiviert"
```

**Graceful Shutdown (SIGINT / SIGTERM):**

```
1. Fastify.close() — neue Requests ablehnen
2. Research-Queue: max 10s drainieren
   → Timeout: laufende Jobs → status='pending', Teilergebnisse per UPSERT gespeichert
3. SSE-Connections schließen
4. Backup erstellen (nur wenn seit letztem Backup Schreiboperationen stattfanden)
5. SQLite Connection schließen
6. Exit 0
```

**Logging-Konvention (pino):**

| Level | Verwendung |
|---|---|
| `error` | Unbehandelter Fehler, fataler Start-Fehler, Migration fehlgeschlagen |
| `warn` | Degraded State, Retry-Versuch, 80%-Budget-Schwelle, API nicht erreichbar |
| `info` | Geschäftsereignis: Aktie hinzugefügt, Recherche gestartet/abgeschlossen, Analyse generiert |
| `debug` | SQL-Query-Time, HTTP-Request, Token-Zählung, Cache-Hit/Miss |

Niemals in Logs: API-Keys, Kaufdaten, vollständige Prompt-Texte oder LLM-Responses, persönliche Daten.

**Sicherheits-Konfiguration:** Fastify mit `@fastify/helmet` (Security-Header), Rate-Limiting (10 req/s pro Route, Schutz gegen lokale Malware/Extensions), CORS nur `127.0.0.1:3000`. Input-Validierung über Fastify JSON Schema für alle API-Inputs: Ticker alphanumerisch max 10 Zeichen, ISIN exakt 12 alphanumerisch, numerische Range-Checks.

**Konsequenzen:**
- `buildApp()` in `app.ts` ist ohne `listen()` testbar — Fastify `.inject()` braucht keinen Netzwerkstack
- Nur DB-Fehler und Port-Konflikte sind fatal; alle externen API-Ausfälle nie

---

## ADR-016: Type-Flow von Drizzle-Schema bis Client (2026-02-22)

**Kontext:** Drizzle generiert TypeScript-Typen aus dem Schema. Ohne explizite Ableitungsstrategie entstehen drei separate Typ-Definitionen (DB, API-Route, Client), die manuell synchronisiert werden müssen. Schema-Änderungen propagieren dann nicht automatisch.

**Entscheidung:** `src/shared/types.ts` als Single Source of Truth. Alle Typen werden aus dem Drizzle-Schema abgeleitet; API-Response-Typen sind zusammengesetzte Ableitungen, keine manuellen Interfaces.

```typescript
// src/shared/types.ts
import type { InferSelectModel } from 'drizzle-orm';
import type { stocks, researchItems, metrics } from '../server/db/schema';

export type Stock       = InferSelectModel<typeof stocks>;
export type ResearchItem = InferSelectModel<typeof researchItems>;
export type Metric      = InferSelectModel<typeof metrics>;

// API-Response-Typen als Ableitungen
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

**Begründung:** Schema-Änderung → TypeScript-Fehler in allen Konsumenten → keine stille Typ-Drift. Ohne diese Pipeline dupliziert ein AI-Agent bei iterativer Implementierung zwangsläufig Typen und erzeugt bei Schema-Änderungen inkonsistente Zustände.

**Konsequenzen:**
- `tsconfig.json` konfiguriert `paths: { "@shared/*": ["src/shared/*"] }`
- `vite.config.ts` konfiguriert `resolve.alias: { '@shared': path.resolve(__dirname, 'src/shared') }`
- Client importiert: `import type { Stock } from '@shared/types'`
- Kein `@types/`-Package nötig, kein Code-Generator außer Drizzle selbst

---

## ADR-017: Testing-Strategie (2026-02-22)

**Kontext:** LLM-Calls in Tests müssen ohne echte API-Keys reproduzierbar sein. Contract-Tests müssen PRD-Verifikationsvorgaben automatisch prüfen. Unit- und Integration-Tests müssen getrennte Feedback-Loops haben. CI darf keine API-Kosten verursachen.

**Entscheidung:** Vier Test-Ebenen mit explizit getrennten Configs:

| Ebene | Tool | Config | Trigger | Ziel |
|---|---|---|---|---|
| Contract | Vitest | `vitest.config.ts` | Vor Implementierung (TDD), nach API-Änderung | PRD-Verifikation, API-Stabilität |
| Unit | Vitest | `vitest.config.ts` | Nach jeder Codeänderung | Geschäftslogik, Berechnungen, Prompt-Builder |
| Integration | Vitest | `vitest.config.integration.ts` | Nach jedem abgeschlossenen REQ | API-Routes + SQLite + Mock-Provider |
| E2E | Playwright (workers=1) | `playwright.config.ts` | Nach UJ-relevanten Änderungen | User Journeys gegen Full-Stack |

**Recording-Pattern für LLM-Tests:**

```
npm run test              → Playback aus __recordings__/ (kostenlos, deterministisch)
LLM_RECORD=true npm test  → Echte Calls + Aufzeichnung in __recordings__/
```

Recording-Key: `{promptVersion}/{ticker}-{period}` — deterministisch, nicht vom Prompt-Inhalt abhängig (der enthält aktienspezifische Daten, die zwischen Testläufen variieren). Recordings sind in Git committed — CI braucht keine API-Keys.

**Contract-Test-Beispiel:**

```typescript
// tests/contracts/depot.contract.test.ts
describe('PRD Verification REQ-001', () => {
  test('POST /api/depot → Response-Shape', async () => {
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

**Integration-Test-Setup:**

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

**Vitest-Konfiguration Integration:**

```typescript
// vitest.config.integration.ts
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.integration.test.ts'],
    globalSetup: ['tests/setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },  // SQLite-Isolation
  },
});
```

**Konsequenzen:**
- `npm run validate` ist der Agent-Heartbeat: typecheck + lint + unit + contract + integration + build — rot = REQ nicht abgeschlossen
- Contract-Tests werden vor der Implementierung geschrieben (TDD-Anker für jeden API-Endpunkt)
- Agent-Workflow pro REQ: Contract-Test → rot → Implementierung → grün → Integration-Test → grün → validate

---

## ADR-018: Client-Routing und Error Boundaries (2026-02-22)

**Kontext:** Die SPA braucht ein Routing-Schema. Render-Fehler in einer Komponente dürfen nicht das gesamte Dashboard oder die gesamte App abstürzen — besonders relevant, weil `yahoo-finance2` inkonsistente Response-Shapes für verschiedene Märkte liefern kann.

**Entscheidung:** `react-router-dom v7` mit vier explizit konfigurierten Routen. Error Boundaries auf Route-Level und auf `StockCard`-Level.

```
/                           → Dashboard.tsx
/stock/:id                  → StockDetail.tsx  (Timeline + Kennzahlen + Moat + Analyse)
/stock/:id/analysis/:aId    → AnalysisReport.tsx
/settings                   → Settings.tsx  (Budget, API-Keys, Kostenübersicht, Privacy)
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

// StockCard wird zusätzlich mit eigener Boundary gewrappt:
<StockCardErrorBoundary key={stock.id}>
  <StockCard stock={stock} />
</StockCardErrorBoundary>
```

**Begründung:** 4 Routen, explizite Konfiguration — kein File-based Routing nötig (das wäre TanStack Router oder Next.js-Komplexität für minimalen Nutzen). Ein Crash in der Kennzahlen-Komponente darf nicht das Dashboard töten; eine fehlerhafte XETRA-Kurs-Response darf nicht die AAPL-Card zerstören.

**Konsequenzen:**
- Vite Dev-Proxy: `/api/*` → `http://127.0.0.1:3001`; SSE-Proxy mit explizit gesetztem `Accept: text/event-stream`-Header via `configure`-Callback
- `@shared`-Alias konfiguriert in `vite.config.ts` unter `resolve.alias` und in `tsconfig.json` unter `paths` — beide müssen konsistent sein

---

## ADR-019: "Seit letztem Besuch"-Algorithmus (2026-02-22)

**Kontext:** REQ-006 und UJ-002 fordern eine kontextuelle Zusammenfassung beim Dashboard-Öffnen nach einer Pause. Der Algorithmus hat ein kritisches Detail: Der Baseline-Timestamp darf erst nach dem Laden aktualisiert werden, nicht beim Öffnen.

**Entscheidung:** `settings.last_dashboard_visit` speichert den Timestamp des letzten Besuchs. `stocks.price_at_last_visit` speichert den Kurs als Baseline für den Kursvergleich. Timestamp-Update erfolgt nach dem Laden der Daten.

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
    // Vergleich: currentPrice vs. price_at_last_visit
  });

  // NACH dem Laden aktualisieren — nicht beim Öffnen.
  // Sonst gehen "neue" Einträge bei Seiten-Refresh sofort verloren.
  await db.update(settings)
    .set({ value: new Date().toISOString() })
    .where(eq(settings.key, 'last_dashboard_visit'));

  // Kurs als neue Baseline speichern
  for (const stock of allStocks) {
    await db.update(stocks)
      .set({ priceAtLastVisit: stock.lastPrice })
      .where(eq(stocks.id, stock.id));
  }

  return { newResearch, priceChanges, lastVisit };
}
```

**Konsequenzen:**
- Kursvergleich: `(currentPrice - price_at_last_visit) / price_at_last_visit * 100 >= 5`
- Kein Cronjob — Lazy-Refresh bei App-Start wenn Recherche einer Aktie > 30 Tage alt und ein neues Quartal verfügbar ist
- Erster Besuch: `last_dashboard_visit` nicht gesetzt → Banner "Willkommen!" statt "Seit letztem Besuch"

---

## Implementierungsreihenfolge

```
Iteration 0: Scaffolding  [BLOCKER für alles Weitere]
  → package.json (alle Dependencies), TypeScript strict, Vite-Proxy-Config
  → Fastify-Grundgerüst: index.ts (listen) + app.ts (buildApp, testbar)
  → Vollständiges Drizzle-Schema + alle Migrationen + FTS5-Trigger
  → SQLite init (WAL, Pragmas, Auto-Migrate, Backup-Logik)
  → LLMGateway-Skeleton (Mock-Provider, CostGuard-Interface, Recording-Infrastruktur)
  → Alle Adapter-Interfaces + Mock-Implementierungen (QuoteProvider, WebSearchProvider)
  → React-App-Shell (Router, QueryClient, leeres Dashboard)
  → src/shared/types.ts mit Drizzle-Ableitungen
  → Health-Endpoint, Zod-Env-Validierung, Privacy-Consent-Platzhalter (Settings)
  → Contract-Test-Template, Vitest-Configs (Unit + Integration), Playwright-Config
  → ESLint, Prettier, package-lock.json committed
  GATE: npm run validate → grün; App startet; /api/health antwortet mit HTTP 200

Iteration 1: REQ-001 + REQ-002  (Depot + Kurse)
  → Contract-Tests für /api/depot und /api/depot/:id/quote (TDD-Anker, zuerst)
  → DepotService + QuoteService + YahooQuoteProvider (Batch-Abruf)
  → StockSearch-Autocomplete (Debounce, Fuzzy-Match, OpenFIGI für ISIN)
  → Dashboard-Grundlayout, StockCard mit Error Boundary
  GATE: Contract-Tests grün + E2E (UJ-001 partiell)

Iteration 2: REQ-003  (Webrecherche)
  → Contract-Tests für /api/depot/:id/research
  → TavilySearchProvider + echtes LLMGateway + CostGuard live
  → ResearchService + Research-Queue + SSE-Status-Events
  → is_current + supersedes-Logik + FTS5-Trigger verifizieren
  → Erste LLM-Recordings erstellen (LLM_RECORD=true npm run test:record)
  → Privacy-Consent-Dialog (First Start, modal)
  GATE: Contract-Tests + Integration + E2E (UJ-001 komplett)

Iteration 3: REQ-004  (Kennzahlen)
  → Contract-Tests für /api/depot/:id/metrics
  → MetricsService (generateObject() mit Zod-Schema → typsichere Extraktion)
  → MetricsTable + MiniChart + Trend-Indikatoren + Anomalie-Highlighting (≥20%)
  GATE: Contract-Tests + E2E (UJ-003 partiell)

Iteration 4: REQ-005  (Timeline + Suche)
  → SearchService (FTS5 via search_documents JOIN)
  → Timeline-Komponente mit Quartals-Ankern, leere Quartale explizit markiert
  → Filter nach Datentyp, Volltextsuche, übergreifende Suche
  GATE: Performance-Test (< 3s bei 1.000 Dokumenten)

Iteration 5: REQ-006  (Dashboard)
  → Aufmerksamkeits-Sortierung (neue Daten, Anomalien, Kurs > 5%)
  → "Seit letztem Besuch"-Algorithmus (ADR-019)
  → OfflineBanner (polling /api/health alle 60s), Onboarding-Hinweis
  GATE: E2E (UJ-002)

Iteration 6: REQ-009  (Kosten-UI)
  → Budget-Einstellungen in settings-Tabelle, CostBadge-Komponente
  → Kostenübersicht-Seite (Tag/Woche/Monat), 80%-Warnung via SSE
  GATE: Contract-Tests für /api/costs/summary

Iteration 7: REQ-007  (Burggraben)
  → MoatService + LLM-generierte Initialbewertung
  → Nutzer-Overrides mit Änderungshistorie (supersedes-Pattern)
  GATE: Contract-Tests + E2E

[GATE: REQ-008a — Klick-Prototyp mit 3–5 Nutzern testen, manuelles Approval erforderlich]

Iteration 8a: REQ-008a  (Analyse-UI-Prototyp)
  → AnalysisReport-Komponente mit statischen Dummy-Daten
  → Kein Backend, keine LLM-Calls
  OUTPUT: Klickbarer Prototyp für Nutzertests

Iteration 8b: REQ-008b  (Analyse-Backend)  [NUR nach Prototyp-Validierung]
  → AnalysisService: Phase 1 parallel (completeBatch()) + Phase 2 Summarizer
  → Contract-Tests + Timeline-Archivierung
  GATE: Contract-Tests + E2E (UJ-004)

Iteration 9: REQ-010  (Transaktionen/Performance) — P2
```

---

## Architektur-Invarianten

Checkliste für jede Iteration — Verletzungen sind Release-Blocker:

1. **Kein LLM-Call außerhalb des LLMGateway.** Kein Service importiert `openai`, `@anthropic-ai/sdk` oder `ai` direkt.
2. **Kein externer API-Call ohne Interface.** Yahoo, Tavily, OpenFIGI — alles hinter Adapter-Interfaces; kein direkter Import von `yahoo-finance2` in Services.
3. **`prompt_version` auf jedem generierten Datenpunkt.** Kein LLM-Output ohne Versionsstempel.
4. **`is_current`-Flag auf versionierten Entitäten.** Kein blindes UPSERT; immer Versionskette mit `supersedes`-FK.
5. **FTS5-Sync via Trigger, nicht Application-Code.** Kein manueller `INSERT INTO search_index` im Service-Code.
6. **Privacy-Consent vor erstem externem LLM-Call.** LLMGateway prüft `settings.privacy_consent_given` synchron.
7. **Kosten auch bei Abbruch erfassen.** Kein abgebrochener LLM-Call ohne `cost_log`-Eintrag (`completed=0`).
8. **`127.0.0.1`, nicht `0.0.0.0`.** Fastify bindet ausschließlich auf Loopback.
9. **Content ist Markdown, kein HTML.** `research_items.content` konsistent strukturiert für spätere Embedding-Pipeline (Phase 2).
10. **Backup vor Migration.** Automatisch, keine manuelle Aktion nötig.
11. **`npm run validate` grün vor jedem abgeschlossenen REQ.** Typecheck + Lint + Unit + Contract + Integration + Build.
12. **Kaufdaten niemals in LLM-Prompts.** `shares`, `price`, `fees` werden architektonisch nie an externe APIs gesendet.
13. **Contract-Tests vor Implementierung schreiben.** TDD-Anker für jeden API-Endpunkt definiert, bevor der erste Service-Code entsteht.
14. **Typen aus Drizzle ableiten, nicht manuell definieren.** `src/shared/types.ts` als Single Source of Truth.

---

## Widerspruchs-Auflösungen

| # | Widerspruch | Auflösung | Konsens |
|---|---|---|---|
| W1 | REQ-005 leere Quartale vs. REQ-008 Agenten-Datenbasis | Gate: ≥2 Quartale `status=complete` für Analyse-Button; Lücken als `dataGaps`-Array in Perspektiv-JSONs | Alle drei |
| W2 | REQ-009 P1 vs. Kosten ab erstem Research (REQ-003) | CostGuard als LLMGateway-Infrastruktur ab Iteration 0; REQ-009 ergänzt nur die UI | Alle drei |
| W3 | UJ-001 "60s" vs. 4 Quartalsberichte | Streaming-UX: Basisdaten < 5s sichtbar, Quartale progressiv per SSE nachgeliefert | Alle drei |
| W4 | REQ-003 Auto-Recherche vs. REQ-009 Kostentransparenz | Hinzufügen-Dialog zeigt Schätzung ("bis zu 0,12 EUR inkl. Retry-Puffer") | Alle drei |
| W5 | "Kein Cronjob" vs. "Seit letztem Besuch" aktuell halten | Lazy-Refresh bei App-Start wenn Recherche > 30 Tage alt und neues Quartal verfügbar | Architekt |
| W6 | REQ-006 "375px" vs. Datendichte (REQ-004, REQ-007) | Mobile: kompakte Karten mit Top-3-Kennzahlen; Drill-Down scrollbar | Alle drei |
| W7 | Datenschutz fehlt im PRD | First-Start-Dialog; keine Kaufdaten an LLM; kein Tracking (ADR-012) | Alle drei |
| W8 | Migrations-/Update-Strategie fehlt im PRD | Auto-Migrate bei Start; Backup VOR Migration; nur additive Schema-Änderungen | Alle drei |
| W9 | REQ-003 "Retry 3×" vs. REQ-009 Kostentransparenz | Kostenschätzung mit 1,5×-Puffer; Retries als separate `cost_log`-Einträge (`operation_type='retry'`) | Architekt + DevOps |
| W10 | UNIQUE-Constraint vs. supersedes auf research_items | Partieller Index `WHERE is_current = 1` — löst das Constraint-Problem strukturell (ADR-006) | Alle drei |
| W11 | FTS5-Sync-Mechanik unspezifiziert | SQLite-Trigger + `search_documents`-Brücke als materialisierter Index (ADR-011) | Alle drei |
| W12 | CostGuard Race-Condition bei parallelen Analyse-Calls | `completeBatch()` reserviert Gesamtbudget atomar vorab (ADR-003, ADR-010) | Architekt + SenDev |