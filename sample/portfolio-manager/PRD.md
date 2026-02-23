# PRD — Portfolio Manager

> A personal AI-powered analysis tool for private investors that automatically researches quarterly reports, financial metrics, and news for stocks in your portfolio, stores them in a structured way, and makes them searchable.

---

## User Journeys

### UJ-001: Adding the first stock and viewing research results

**Goal:** The user adds a stock and sees the first research results within 60 seconds.

1. The user opens `http://localhost:3000`. An empty portfolio displays an onboarding hint.
2. The user types "Apple" or "AAPL" into the central search field. Autocomplete returns matches including the exchange (e.g. "Apple Inc. — AAPL — NASDAQ").
3. The user selects a match. The stock immediately appears on the dashboard with the current price and a status badge "Research in progress".
4. In the background, the last 4 quarterly reports are researched. The status badge switches to "Up to date" once complete.
5. The user clicks on the stock and reads AI summaries of the last 4 quarters with source references on the detail page.

**Error case:** Price API unreachable → stock is added without a price, notice "Price could not be loaded". Research starts regardless. No infinite spinner.

---

### UJ-002: Portfolio overview after a break

**Goal:** The user returns after a break of several weeks and immediately identifies stocks that need their attention.

1. The user opens the app. The dashboard shows "Since your last visit [date]: 3 new quarterly reports, 2 price changes > 5%".
2. The dashboard is sorted by action required: stocks with new data or anomalies appear at the top.
3. The user clicks on a highlighted stock (badge: "New quarterly report"). The Timeline view jumps to the latest entry.
4. The user decides whether to start a deeper AI analysis.

**Error case:** No new data since the last visit → dashboard shows a neutral status without errors or an empty screen.

---

### UJ-003: Looking up a metric and investigating an anomaly

**Goal:** The user checks the margin trend of a stock over the last four quarters.

1. The user opens the detail page of a stock. The metrics section shows "Operating margin ↓ −22% vs. prior quarter" (highlighted).
2. The user clicks on the metric → a drill-down shows the historical trend as a mini chart, along with the source (URL + retrieval date).
3. Q2 2024 is marked as "Not available". The user manually triggers an AI research request for this value.
4. The research finds two conflicting sources. Notice: "Source A: 12.3% / Source B: 11.8% — please confirm manually."

**Error case:** Research fails → value remains "Not available" with a timestamp of the last attempt. The user can try again later.

---

### UJ-004: Generating an AI analysis report

**Goal:** The user has three AI perspectives generate a structured analysis report based on the stored data.

1. The user opens the detail page of a stock with at least 2 quarters of data. The "Generate analysis" button is active.
2. Before starting, a prompt appears: "Three AI perspectives will analyze this stock based on your stored data. Estimated duration: 30–60 s."
3. A loading indicator with a time estimate is shown. After completion: a structured report with three sections (fundamental analyst, moat expert, bear/risk perspective) and a consolidated summary.
4. The report appears in the Timeline under today's date.

**Error case:** Data basis too thin (< 2 quarters) → button disabled with the notice "At least 2 quarterly reports are required for an analysis."

---

## Requirements

### REQ-000: Walking Skeleton — Technical Foundation

- **Status:** open
- **Priority:** P0
- **Size:** M
- **Depends on:** ---

#### Description
Build the complete technical foundation as described in `architecture.md`. No business content — infrastructure only: all dependencies installed, build system, linter, and test runner configured, development server running, and a minimal E2E path through all architectural layers (e.g. a Hello World endpoint that executes a DB query and renders the result in the frontend — no business logic).

#### Acceptance Criteria
- [ ] All dependencies installed (`npm ci`), no version conflicts
- [ ] Build succeeds (`vite build` + `tsc -p tsconfig.server.json` — no errors)
- [ ] TypeScript strict check passes (`tsc --noEmit`)
- [ ] Linter passes (`eslint src/` — no errors)
- [ ] Vitest unit and contract tests start and pass (0 failures)
- [ ] Vitest integration tests with in-memory SQLite pass
- [ ] Drizzle schema + all migrations + FTS5 triggers executed
- [ ] Fastify server starts on `127.0.0.1:3000`, binds exclusively to loopback
- [ ] `/api/health` responds with HTTP 200 (including DB status)
- [ ] React SPA is served by the Fastify server (`curl http://127.0.0.1:3000` → HTTP 200)
- [ ] LLMGateway skeleton with mock provider present (no real API key required)
- [ ] All adapter interfaces + mock implementations present (QuoteProvider, WebSearchProvider)
- [ ] `npm run validate` passes (typecheck + lint + test + test:contracts + test:integration + build)

#### Verification
`npm run validate` passes; `npm start` starts without errors; `curl http://127.0.0.1:3000/api/health` → HTTP 200 with `{"status":"ok","db":"ok"}`

---

### REQ-001: Adding stocks and managing the portfolio

- **Status:** open
- **Priority:** P0
- **Size:** M
- **Depends on:** ---

#### Description
Users add stocks via a single input field using ticker, company name, or ISIN. Autocomplete with fuzzy matching shows results including the exchange to resolve ambiguities (e.g. "SAP — XETRA" vs. "SAP — NYSE"). Purchase data (date, number of shares, purchase price, currency) is optional and can be entered when adding a stock or at any time afterwards. Without purchase data, the position is treated as a watchlist entry; with purchase data it becomes a portfolio position with performance tracking (via REQ-010).

#### Acceptance Criteria
- [ ] Single input field with autocomplete (ticker + company name + ISIN, fuzzy match)
- [ ] Search results show exchange for disambiguation (e.g. "AAPL — NASDAQ")
- [ ] Stock is added with a single click/Enter — no required fields other than the stock selection itself
- [ ] Purchase data (date, shares, price, currency) accessible via an expandable optional form
- [ ] Additional purchases are recorded as separate transactions, not as an overwrite of the original position
- [ ] Duplicate detection: the same stock + same exchange cannot be added twice; instead an offer to "Record additional purchase?" is shown
- [ ] Stock can be removed from the portfolio (with a confirmation dialog)
- [ ] All portfolio data persists between sessions (local data storage)
- [ ] Search error case: "No stock found" with a hint to try an alternative search format (ticker instead of name, ISIN)
- [ ] Price API error case when adding: stock is still added, clear notice shown with no infinite spinner

#### Verification
`curl -X POST http://localhost:3000/api/depot -d '{"ticker":"AAPL","exchange":"NASDAQ"}'` → `{"id":"...","ticker":"AAPL","exchange":"NASDAQ","addedAt":"..."}`

---

### REQ-002: Prices and currency display

- **Status:** open
- **Priority:** P0
- **Size:** S
- **Depends on:** REQ-001

#### Description
Prices are retrieved from a documented, free API. A delay of 15–20 minutes is acceptable and must be transparent to the user. Each stock shows its price in the original currency; an optional EUR conversion can be toggled. During API outages, the last known price is shown with a warning — never an empty value without explanation.

#### Acceptance Criteria
- [ ] Current price of each stock is visible on the dashboard
- [ ] Timestamp of the last retrieval and delay notice are visible (e.g. "As of 14:32 — 15 min. delayed")
- [ ] Stock currency is displayed correctly (USD, EUR, GBP, etc.)
- [ ] Optional EUR conversion for foreign-currency stocks can be toggled
- [ ] On API error: last known price with warning notice, no infinite spinner, no empty field
- [ ] On non-trading days: closing price of the last trading day with a label
- [ ] Price source is documented within the application and consistent across all stocks

#### Verification
`curl http://localhost:3000/api/depot/AAPL/quote` → `{"price":182.50,"currency":"USD","timestamp":"2025-01-15T14:32:00Z","delayed":true,"delayMinutes":15}`

---

### REQ-003: Automated web research (quarterly reports and news)

- **Status:** open
- **Priority:** P0
- **Size:** L
- **Depends on:** REQ-001

#### Description
When a stock is added, the last 4 quarterly reports are automatically summarised via AI web research and stored. Each summary contains the period, key data, source URL, and retrieval date. Additionally, price-relevant news (earnings, M&A, regulatory changes) is researched and stored with a 2–3-sentence summary. The research status is visible per stock at all times. No cron job in the MVP — the trigger is adding a new stock or a manual button press. Partial results are stored; a single failure does not block the overall result.

#### Acceptance Criteria
- [ ] When a stock is added: automatic start of research into the last 4 quarterly reports
- [ ] Each quarterly report summary contains: period, revenue, profit/loss, outlook, source URL, retrieval date
- [ ] News entries contain: title, date, source URL, 2–3-sentence summary; only price-relevant items (no general noise)
- [ ] Research status visible per stock: `Research in progress` / `Up to date` / `Partially loaded` / `Error at [Source X]`
- [ ] Timestamp of the last successful research is visible
- [ ] Manual re-research triggerable via a button
- [ ] Partial results are stored and displayed (no all-or-nothing)
- [ ] Failed sources are shown by name, not as a generic "Error"
- [ ] UI is not blocked during active research (asynchronous execution)
- [ ] Automatic retry on transient errors (max. 3×, exponential backoff)
- [ ] When conflicting values are found from different sources: the user is informed with both values and their origins — no silent preference for one value

#### Verification
`curl http://localhost:3000/api/depot/AAPL/research` → Array with at least 1 object of the form `{"period":"Q3 2024","revenue":"...","earnings":"...","sourceUrl":"...","fetchedAt":"..."}`

---

### REQ-004: Financial metrics tracking as a time series

- **Status:** open
- **Priority:** P0
- **Size:** M
- **Depends on:** REQ-003

#### Description
Key financial metrics are stored per stock as a time series at quarterly resolution. Standard metrics are automatically extracted from the research results. Users can manually define additional company-specific metrics per stock (e.g. "DAU" for Meta). Missing values are explicitly marked as "Not available" — never as 0 or an empty cell. Each data point has a traceable source reference. Deviations of ≥ 20% compared to the prior quarter are visually highlighted.

#### Acceptance Criteria
- [ ] Standard metrics automatically populated: P/E, P/B, EPS, Capex, FCF, revenue, operating margin, debt ratio
- [ ] Metrics stored as a time series (at least quarterly resolution, at least 4 quarters of depth)
- [ ] Users can define individual metrics per stock (name + value + period)
- [ ] Missing values are displayed as "Not available" — no 0, no empty cell
- [ ] Each data point has a source reference (URL + retrieval date)
- [ ] Trend indicator per metric (↑ ↓ →) based on the last two values
- [ ] Deviations ≥ 20% compared to the prior quarter are visually highlighted (colour or badge)
- [ ] Currency visible for all monetary metrics; optional EUR conversion can be toggled
- [ ] Drill-down: clicking a metric shows the historical trend as a mini chart + source details
- [ ] Users can enter missing values manually or trigger an AI re-research via an explicit action

#### Verification
`curl http://localhost:3000/api/depot/AAPL/metrics` → Array of metric objects with fields `name`, `periods` (Array of `{quarter, value, source, fetchedAt, status}`), `trend`

---

### REQ-005: Data history with Timeline navigation and full-text search

- **Status:** open
- **Priority:** P0
- **Size:** M
- **Depends on:** REQ-003, REQ-004

#### Description
All collected data (quarterly reports, news, metrics, AI analyses) is stored persistently and browsed via a Timeline navigation. Quarters are the primary anchor points; empty quarters are explicitly marked as such. The MVP includes structured filters and full-text search. Semantic search is explicitly not part of the MVP and will be added in Phase 2 once enough data is available to make meaningful use of it.

#### Acceptance Criteria
- [ ] All research results, metrics, and AI analyses are stored persistently
- [ ] Timeline view per stock: quarters as visual anchor points, entries assigned chronologically
- [ ] Empty quarters visibly marked: "No data for Q2 2024"
- [ ] Filter by data type (quarterly report / news / metric / AI analysis / moat)
- [ ] Full-text search across all data for a stock (keyword-based)
- [ ] Cross-portfolio search across multiple stocks (e.g. "Which stocks had declining margins?")
- [ ] Results show context: source, date, data type
- [ ] "What changed since your last visit" indicator per quarter
- [ ] Performance: search under 3 s with > 1,000 stored documents
- [ ] AI analyses (REQ-008) are archived in the Timeline and retrievable by date

#### Verification
`curl "http://localhost:3000/api/depot/AAPL/history?type=report&from=2024-01-01"` → filtered list with fields `type`, `period`, `content`, `source`, `createdAt`

#### Explicitly Out of Scope (MVP)
- Semantic / natural-language search → Phase 2
- Embedding pipeline / vector store → Phase 2

> ⚠️ **Potential conflict with REQ-008:** REQ-008 requires that AI agents "access exclusively the stored data of the stock" and therefore assumes a valid data basis. REQ-005 explicitly allows empty quarters. How agents handle incomplete data (abort, flag as gap, note in report) must be defined in the architecture phase.

---

### REQ-006: Web frontend with attention dashboard

- **Status:** open
- **Priority:** P0
- **Size:** L
- **Depends on:** REQ-001, REQ-002, REQ-003

#### Description
A web-based single-page application as the sole access channel. Single-user, starts locally with a single command. The dashboard is not a uniform list but sorts stocks by action required: positions with new data, anomalies, or price changes > 5% stand out visually; quiet positions recede. When opened after a break, a compact "Since your last visit" summary is shown.

#### Acceptance Criteria
- [ ] Dashboard shows all portfolio stocks: name, ticker, price, daily change (%)
- [ ] Default sort by "action required" (new data, anomalies, price changes > 5% at the top)
- [ ] Stocks with new research results or metric anomalies carry a visual indicator (badge, colour tint)
- [ ] Quiet stocks without new data are displayed more subtly
- [ ] Alternative sort options selectable: alphabetical, performance (when purchase data is available), date added
- [ ] "Since your last visit [date]" summary on open: new reports, price changes > 5%
- [ ] Total portfolio value visible when purchase data is maintained; otherwise number of positions
- [ ] Clicking a stock opens the detail page (Timeline, metrics, news, AI analyses, moat)
- [ ] Adding a stock is possible directly from the dashboard
- [ ] Empty portfolio: onboarding hint instead of blank screen
- [ ] Responsive design (desktop-first; core features usable at 375 px width)
- [ ] Dashboard load time < 2 s
- [ ] Application starts locally with a single command (e.g. `npm start`)

#### Verification
`npm start` → no error exit code; `curl http://localhost:3000` responds with HTTP 200 in < 2 s

---

### REQ-007: Moat Assessment

- **Status:** open
- **Priority:** P1
- **Size:** M
- **Depends on:** REQ-003

#### Description
A structured moat assessment per stock with five standard categories. The AI generates an initial rating based on the stored research results; the user can override or comment on each category. All changes are versioned so that the evolution of the assessment remains traceable over time. This feature is not a pure AI output but a collaborative analysis building block.

#### Acceptance Criteria
- [ ] Five categories: brand strength, network effects, cost advantages, switching costs, regulatory advantages
- [ ] Rating per category: strong / medium / weak / none — with a justification text
- [ ] AI generates an initial rating based on the stored data for the stock
- [ ] User can override or comment on the AI rating per category
- [ ] Overall rating (wide / narrow / no moat) is derived from the individual ratings
- [ ] Change history visible: "AI: strong on [date] → User: medium on [date]"
- [ ] Sources for each assessment are traceable (referenced to stored data points)

#### Verification
`curl http://localhost:3000/api/depot/AAPL/moat` → object with fields `categories` (Array), `overallRating`, `lastUpdated`, `history` (Array of changes)

---

### REQ-008: AI Analysis Report (Multi-Agent)

- **Status:** open
- **Priority:** P1
- **Size:** L
- **Depends on:** REQ-004, REQ-005

#### Description
A structured analysis report from three AI perspectives is generated via an explicit trigger: fundamental analyst, moat expert, bear/risk perspective. V1 is not a live chat but a readable report with clearly separated sections — this substantially reduces UX risk and requires no new mental model. Each agent references exclusively stored data points for the stock. The discussion ends after a maximum of N rounds (configurable, default 5) with a consolidated summary. A clickable UX prototype must be validated with 3–5 users before backend implementation begins.

#### Acceptance Criteria
- [ ] "Generate analysis" button per stock; only active when at least 2 quarters of data are available
- [ ] Before starting: a brief explanation (max. 2 sentences) + estimated duration (e.g. "approx. 30–60 s")
- [ ] Three perspectives: fundamental analyst, moat expert, bear/risk perspective
- [ ] Each section references concrete stored data points with source citations (no unsupported claims)
- [ ] Result: structured report with clearly separated, semantically labelled perspective sections
- [ ] Consolidated summary at the end: key theses, points of consensus and dissent
- [ ] Discussion ends after max. N rounds (default 5, configurable)
- [ ] User can cancel an ongoing discussion without data loss; partial result remains saved
- [ ] Report is archived in the Timeline (REQ-005)
- [ ] Deliberately not included in V1: live chat, user questions during discussion, interactive flow
- [ ] **Prerequisite before backend implementation:** clickable prototype tested and validated with 3–5 users

#### Verification
`curl -X POST http://localhost:3000/api/depot/AAPL/analysis` → `{"id":"...","status":"running","estimatedSeconds":45}`; after completion: `GET /api/depot/AAPL/analysis/:id` → object with fields `perspectives` (Array with `role`, `content`, `datapointsReferenced`), `summary`, `consensusPoints`, `dissentPoints`, `archivedAt`

> ⚠️ **Potential conflict with REQ-005:** REQ-008 assumes a complete data basis (agents access "exclusively stored data"). REQ-005 explicitly allows empty quarters. What an agent does when no data exists for a quarter (abort, flag as gap, note in report) is not specified and must be decided in the architecture phase.

---

### REQ-009: Cost transparency and limits

- **Status:** open
- **Priority:** P1
- **Size:** S
- **Depends on:** REQ-003, REQ-008

#### Description
Every AI operation (research, analysis) incurs API costs. Without transparency, either usage anxiety develops (the feature is never used) or unexpected bills arrive (loss of trust). Users see an estimate before any paid operation and can configure an optional monthly budget limit.

#### Acceptance Criteria
- [ ] Before each research and analysis operation: estimated token consumption and cost equivalent in EUR shown
- [ ] Cumulative costs per day / week / month viewable in settings
- [ ] Optional budget limit configurable (e.g. "max. €20 / month") with a warning at 80%
- [ ] Cancelled operations are recorded proportionally (no zero value on cancellation)
- [ ] Cost overview is permanently accessible in the app settings

#### Verification
`curl http://localhost:3000/api/costs/summary` → `{"today":{"tokens":4200,"estimatedEur":0.12},"month":{"tokens":82000,"estimatedEur":2.35},"budgetLimit":20,"budgetUsedPercent":11.7}`

---

### REQ-010: Buy/sell history and performance tracking

- **Status:** open
- **Priority:** P2
- **Size:** M
- **Depends on:** REQ-001, REQ-002

#### Description
Optionally recorded transaction data extends the analysis tool with performance tracking. Positions without purchase data remain fully functional (watchlist mode). Realised gains and losses are only calculated for positions with a complete transaction history. The tool is primarily an analysis memory, not a brokerage replacement — which is why this feature is P2.

#### Acceptance Criteria
- [ ] Purchase recordable: date, number of shares, purchase price, currency, optional fees
- [ ] Partial sales recordable: date, number of shares, sale price
- [ ] Realised gain/loss calculated per position and overall
- [ ] Dividend payments recordable: date, amount per share
- [ ] Closed positions remain visible in the data history, visually distinguished from open positions
- [ ] Currency conversion: transactions in foreign currency, performance display optionally in EUR

#### Verification
`curl -X POST http://localhost:3000/api/depot/AAPL/transactions -d '{"type":"buy","date":"2024-03-15","shares":10,"price":175.50,"currency":"USD"}'` → `{"transactionId":"...","unrealizedGainEur":72.30}`
