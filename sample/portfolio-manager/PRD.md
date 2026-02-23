# PRD — Portfolio Manager

> Persönliches KI-gestütztes Analyse-Werkzeug für Privatanleger, das Quartalsberichte, Finanzkennzahlen und News zu eigenen Depot-Aktien automatisch recherchiert, strukturiert speichert und durchsuchbar macht.

---

## User Journeys

### UJ-001: Erste Aktie aufnehmen und Recherche-Ergebnis einsehen

**Ziel:** Nutzer nimmt eine Aktie auf und sieht innerhalb von 60 Sekunden die ersten Recherche-Ergebnisse.

1. Nutzer öffnet `http://localhost:3000`. Leeres Depot zeigt Onboarding-Hinweis.
2. Nutzer tippt „Apple" oder „AAPL" in das zentrale Suchfeld. Autocomplete liefert Treffer mit Börsenplatz (z.B. „Apple Inc. — AAPL — NASDAQ").
3. Nutzer wählt einen Treffer. Aktie erscheint sofort im Dashboard mit aktuellem Kurs und Status-Badge „Recherche läuft".
4. Im Hintergrund werden die letzten 4 Quartalsberichte recherchiert. Status-Badge wechselt auf „Aktuell" nach Abschluss.
5. Nutzer klickt auf die Aktie und liest auf der Detailseite die KI-Zusammenfassungen der letzten 4 Quartale mit Quellenangaben.

**Fehlerfall:** Kurs-API nicht erreichbar → Aktie wird ohne Kurs hinzugefügt, Hinweis „Kurs konnte nicht geladen werden". Recherche startet trotzdem. Kein Endlos-Spinner.

---

### UJ-002: Depot-Überblick nach Nutzungspause

**Ziel:** Nutzer kehrt nach mehrwöchiger Pause zurück und identifiziert sofort Aktien, die seine Aufmerksamkeit benötigen.

1. Nutzer öffnet die App. Dashboard zeigt „Seit deinem letzten Besuch [Datum]: 3 neue Quartalsberichte, 2 Kursveränderungen > 5 %".
2. Dashboard ist nach Handlungsbedarf sortiert: Aktien mit neuen Daten oder Anomalien stehen oben.
3. Nutzer klickt auf eine hervorgehobene Aktie (Badge: „Neuer Quartalsbericht"). Timeline-View springt zum neusten Eintrag.
4. Nutzer entscheidet, ob er eine vertiefte KI-Analyse starten möchte.

**Fehlerfall:** Keine neuen Daten seit dem letzten Besuch → Dashboard zeigt neutralen Status ohne Fehler oder leeren Bildschirm.

---

### UJ-003: Kennzahl nachschlagen und Anomalie untersuchen

**Ziel:** Nutzer prüft die Margenentwicklung einer Aktie über die letzten vier Quartale.

1. Nutzer öffnet die Detailseite einer Aktie. Kennzahlen-Abschnitt zeigt „Operative Marge ↓ −22 % ggü. Vorquartal" (hervorgehoben).
2. Nutzer klickt auf die Kennzahl → Drill-Down zeigt historischen Verlauf als Mini-Chart, Quelle (URL + Abrufdatum).
3. Q2 2024 ist als „Nicht verfügbar" markiert. Nutzer löst manuell eine KI-Recherche für diesen Wert aus.
4. Recherche findet zwei widersprüchliche Quellen. Hinweis: „Quelle A: 12,3 % / Quelle B: 11,8 % — bitte manuell bestätigen."

**Fehlerfall:** Recherche schlägt fehl → Wert bleibt „Nicht verfügbar" mit Zeitstempel des letzten Versuchs. Nutzer kann es später erneut versuchen.

---

### UJ-004: KI-Analysebericht generieren

**Ziel:** Nutzer lässt drei KI-Perspektiven einen strukturierten Analysebericht auf Basis der gespeicherten Daten erstellen.

1. Nutzer öffnet Detailseite einer Aktie mit mindestens 2 Quartalen Datenbasis. Button „Analyse generieren" ist aktiv.
2. Vor dem Start erscheint: „Drei KI-Perspektiven analysieren diese Aktie anhand Ihrer gespeicherten Daten. Dauer ca. 30–60 s."
3. Ladeindikator mit Zeitschätzung. Nach Abschluss: strukturierter Bericht mit drei Abschnitten (Fundamentalanalyst, Burggraben-Experte, Bären-/Risiko-Perspektive) und konsolidierter Zusammenfassung.
4. Bericht erscheint in der Timeline unter dem heutigen Datum.

**Fehlerfall:** Datenbasis zu dünn (< 2 Quartale) → Button deaktiviert mit Hinweis „Für eine Analyse werden mindestens 2 Quartalsberichte benötigt."

---

## Requirements

### REQ-000: Walking Skeleton — Technisches Grundgerüst

- **Status:** open
- **Priorität:** P0
- **Größe:** M
- **Abhängig von:** ---

#### Beschreibung
Baue das vollständige technische Grundgerüst entsprechend `architecture.md`. Kein Business-Inhalt — nur Infrastruktur: alle Abhängigkeiten installiert, Build-System, Linter, Test-Runner konfiguriert, Development-Server lauffähig, eine minimale E2E-Schicht durch alle architekturellen Schichten (z.B. ein Hello-World-Endpunkt der eine DB-Query ausführt und im Frontend angezeigt wird — ohne Businesslogik).

#### Akzeptanzkriterien
- [ ] Alle Abhängigkeiten installiert (`npm ci`), keine Versionskonflikte
- [ ] Build erfolgreich (`vite build` + `tsc -p tsconfig.server.json` — keine Fehler)
- [ ] TypeScript strict-Check grün (`tsc --noEmit`)
- [ ] Linter grün (`eslint src/` — keine Fehler)
- [ ] Vitest Unit- und Contract-Tests starten und laufen durch (0 failures)
- [ ] Vitest Integration-Tests mit In-Memory-SQLite laufen durch
- [ ] Drizzle-Schema + alle Migrationen + FTS5-Trigger ausgeführt
- [ ] Fastify-Server startet auf `127.0.0.1:3000`, bindet ausschließlich auf Loopback
- [ ] `/api/health` antwortet mit HTTP 200 (inkl. DB-Status)
- [ ] React-SPA wird vom Fastify-Server ausgeliefert (`curl http://127.0.0.1:3000` → HTTP 200)
- [ ] LLMGateway-Skeleton mit Mock-Provider vorhanden (kein echter API-Key nötig)
- [ ] Alle Adapter-Interfaces + Mock-Implementierungen vorhanden (QuoteProvider, WebSearchProvider)
- [ ] `npm run validate` grün (typecheck + lint + test + test:contracts + test:integration + build)

#### Verifikation
`npm run validate` grün; `npm start` startet ohne Fehler; `curl http://127.0.0.1:3000/api/health` → HTTP 200 mit `{"status":"ok","db":"ok"}`

---

### REQ-001: Aktie hinzufügen und Depot verwalten

- **Status:** open
- **Priorität:** P0
- **Größe:** M
- **Abhängig von:** ---

#### Beschreibung
Nutzer fügt Aktien über ein einzelnes Eingabefeld per Ticker, Firmenname oder ISIN hinzu. Autocomplete mit Fuzzy-Match zeigt Treffer inklusive Börsenplatz, um Mehrdeutigkeiten aufzulösen (z.B. „SAP — XETRA" vs. „SAP — NYSE"). Kaufdaten (Datum, Stückzahl, Kaufpreis, Währung) sind optional und können beim Hinzufügen oder jederzeit nachträglich erfasst werden. Ohne Kaufdaten gilt die Position als Watchlist-Eintrag; mit Kaufdaten als Portfolio-Position mit Performance-Berechnung (via REQ-010).

#### Akzeptanzkriterien
- [ ] Einzelnes Eingabefeld mit Autocomplete (Ticker + Firmenname + ISIN, Fuzzy-Match)
- [ ] Suchergebnisse zeigen Börsenplatz zur Disambiguierung (z.B. „AAPL — NASDAQ")
- [ ] Aktie wird mit einem Klick/Enter hinzugefügt — keine Pflichtfelder außer der Aktienauswahl selbst
- [ ] Kaufdaten (Datum, Stückzahl, Preis, Währung) sind als aufklappbares Optional-Formular zugänglich
- [ ] Nachkäufe werden als separate Transaktionen erfasst, nicht als Überschreibung der Ursprungsposition
- [ ] Duplikat-Erkennung: gleiche Aktie + gleicher Börsenplatz kann nicht doppelt hinzugefügt werden; stattdessen Angebot „Nachkauf erfassen?"
- [ ] Aktie kann aus dem Depot entfernt werden (mit Bestätigungsdialog)
- [ ] Alle Depot-Daten persistieren zwischen Sessions (lokale Datenhaltung)
- [ ] Fehlerfall Suche: „Keine Aktie gefunden" mit Hinweis auf alternatives Suchformat (Ticker statt Name, ISIN)
- [ ] Fehlerfall Kurs-API beim Hinzufügen: Aktie wird trotzdem hinzugefügt, klarer Hinweis ohne Endlos-Spinner

#### Verifikation
`curl -X POST http://localhost:3000/api/depot -d '{"ticker":"AAPL","exchange":"NASDAQ"}'` → `{"id":"...","ticker":"AAPL","exchange":"NASDAQ","addedAt":"..."}`

---

### REQ-002: Kurse und Währungsanzeige

- **Status:** open
- **Priorität:** P0
- **Größe:** S
- **Abhängig von:** REQ-001

#### Beschreibung
Kurse werden aus einer dokumentierten, kostenlosen API bezogen. Eine Verzögerung von 15–20 Minuten ist akzeptabel und muss für den Nutzer transparent sein. Jede Aktie zeigt den Kurs in der Originalwährung; eine optionale EUR-Umrechnung kann eingeblendet werden. Bei API-Ausfällen wird der zuletzt bekannte Kurs mit Warnhinweis angezeigt — nie ein leerer Wert ohne Erklärung.

#### Akzeptanzkriterien
- [ ] Aktueller Kurs jeder Aktie ist auf dem Dashboard sichtbar
- [ ] Zeitstempel des letzten Abrufs und Verzögerungs-Hinweis sind sichtbar (z.B. „Stand: 14:32 — 15 Min. verzögert")
- [ ] Währung der Aktie wird korrekt angezeigt (USD, EUR, GBP etc.)
- [ ] Optionale EUR-Umrechnung für Fremdwährungsaktien einblendbar
- [ ] Bei API-Fehler: letzter bekannter Kurs mit Warnhinweis, kein Endlos-Spinner, kein leeres Feld
- [ ] An Nicht-Handelstagen: Schlusskurs des letzten Handelstags mit Kennzeichnung
- [ ] Kursquelle ist innerhalb der Anwendung dokumentiert und einheitlich für alle Aktien

#### Verifikation
`curl http://localhost:3000/api/depot/AAPL/quote` → `{"price":182.50,"currency":"USD","timestamp":"2025-01-15T14:32:00Z","delayed":true,"delayMinutes":15}`

---

### REQ-003: Automatisierte Webrecherche (Quartalsberichte und News)

- **Status:** open
- **Priorität:** P0
- **Größe:** L
- **Abhängig von:** REQ-001

#### Beschreibung
Bei Neuaufnahme einer Aktie werden automatisch die letzten 4 Quartalsberichte per KI-Webrecherche zusammengefasst und gespeichert. Jede Zusammenfassung enthält Zeitraum, Kerndaten, Quell-URL und Abrufdatum. Zusätzlich werden kursrelevante News (Earnings, M&A, regulatorische Änderungen) recherchiert und mit 2–3-Satz-Zusammenfassung gespeichert. Der Recherche-Status ist pro Aktie jederzeit sichtbar. Kein Cronjob im MVP — Trigger ist Neuaufnahme oder manueller Knopfdruck. Partielle Ergebnisse werden gespeichert; ein Einzelfehler blockiert nicht das Gesamtergebnis.

#### Akzeptanzkriterien
- [ ] Bei Neuaufnahme einer Aktie: automatischer Start der Recherche der letzten 4 Quartalsberichte
- [ ] Jede Quartalsbericht-Zusammenfassung enthält: Zeitraum, Umsatz, Gewinn/Verlust, Ausblick, Quell-URL, Abrufdatum
- [ ] News-Einträge enthalten: Titel, Datum, Quell-URL, 2–3-Satz-Zusammenfassung; nur kursrelevante Meldungen (kein allgemeines Rauschen)
- [ ] Pro Aktie sichtbarer Recherche-Status: `Recherche läuft` / `Aktuell` / `Teilweise geladen` / `Fehler bei [Quelle X]`
- [ ] Zeitstempel der letzten erfolgreichen Recherche ist sichtbar
- [ ] Manuelle Neu-Recherche per Knopfdruck auslösbar
- [ ] Partielle Ergebnisse werden gespeichert und angezeigt (kein Alles-oder-Nichts)
- [ ] Fehlgeschlagene Quellen werden namentlich angezeigt, nicht generisch „Fehler"
- [ ] UI ist während laufender Recherche nicht blockiert (asynchrone Ausführung)
- [ ] Automatischer Retry bei transienten Fehlern (max. 3×, exponentielles Backoff)
- [ ] Bei widersprüchlichen Werten aus verschiedenen Quellen: Nutzer wird mit beiden Werten und ihrer Herkunft informiert — kein stilles Bevorzugen eines Werts

#### Verifikation
`curl http://localhost:3000/api/depot/AAPL/research` → Array mit mind. 1 Objekt der Form `{"period":"Q3 2024","revenue":"...","earnings":"...","sourceUrl":"...","fetchedAt":"..."}`

---

### REQ-004: Finanzkennzahlen-Tracking als Zeitreihe

- **Status:** open
- **Priorität:** P0
- **Größe:** M
- **Abhängig von:** REQ-003

#### Beschreibung
Zentrale Finanzkennzahlen werden pro Aktie als Zeitreihe in Quartalsauflösung gespeichert. Standard-Kennzahlen werden automatisch aus den Recherche-Ergebnissen extrahiert. Nutzer kann pro Aktie zusätzliche, unternehmensspezifische Kennzahlen manuell definieren (z.B. „DAU" für Meta). Fehlende Werte sind explizit als „Nicht verfügbar" markiert — niemals als 0 oder leere Zelle. Jeder Datenpunkt hat eine nachvollziehbare Quellenangabe. Abweichungen ≥ 20 % zum Vorquartal werden visuell hervorgehoben.

#### Akzeptanzkriterien
- [ ] Standard-Kennzahlen automatisch befüllt: P/E, P/B, EPS, Capex, FCF, Umsatz, operative Marge, Verschuldungsgrad
- [ ] Kennzahlen als Zeitreihe gespeichert (mindestens Quartalsauflösung, mindestens 4 Quartale Tiefe)
- [ ] Nutzer kann pro Aktie individuelle Kennzahlen definieren (Name + Wert + Zeitraum)
- [ ] Fehlende Werte werden als „Nicht verfügbar" dargestellt — keine 0, keine leere Zelle
- [ ] Jeder Datenpunkt hat eine Quellenangabe (URL + Abrufdatum)
- [ ] Trend-Indikator pro Kennzahl (↑ ↓ →) auf Basis der letzten zwei Werte
- [ ] Abweichungen ≥ 20 % zum Vorquartal werden visuell hervorgehoben (Farbe oder Badge)
- [ ] Währung bei allen monetären Kennzahlen sichtbar; optionale EUR-Umrechnung einblendbar
- [ ] Drill-Down: Klick auf Kennzahl zeigt historischen Verlauf als Mini-Chart + Quellendetails
- [ ] Nutzer kann fehlende Werte manuell erfassen oder per explizitem Trigger eine KI-Nachrecherche auslösen

#### Verifikation
`curl http://localhost:3000/api/depot/AAPL/metrics` → Array von Kennzahl-Objekten mit Feldern `name`, `periods` (Array von `{quarter, value, source, fetchedAt, status}`), `trend`

---

### REQ-005: Datenhistorie mit Timeline-Navigation und Volltextsuche

- **Status:** open
- **Priorität:** P0
- **Größe:** M
- **Abhängig von:** REQ-003, REQ-004

#### Beschreibung
Alle gesammelten Daten (Quartalsberichte, News, Kennzahlen, KI-Analysen) werden persistent gespeichert und über eine Zeitachsen-Navigation erschlossen. Quartale sind die primären Ankerpunkte; leere Quartale werden explizit als solche markiert. Im MVP gibt es strukturierte Filter und Volltextsuche. Semantische Suche ist explizit nicht Teil des MVP und wird in Phase 2 ergänzt, sobald genug Datenbasis vorhanden ist, um sie sinnvoll nutzen zu können.

#### Akzeptanzkriterien
- [ ] Alle Recherche-Ergebnisse, Kennzahlen und KI-Analysen werden persistent gespeichert
- [ ] Timeline-View pro Aktie: Quartale als visuelle Ankerpunkte, Einträge chronologisch zugeordnet
- [ ] Leere Quartale sichtbar markiert: „Keine Daten für Q2 2024"
- [ ] Filter nach Datentyp (Quartalsbericht / News / Kennzahl / KI-Analyse / Burggraben)
- [ ] Volltextsuche über alle Daten einer Aktie (Keyword-basiert)
- [ ] Übergreifende Suche über mehrere Depot-Aktien möglich (z.B. „Welche Aktien hatten sinkende Margen?")
- [ ] Ergebnisse zeigen Kontext: Quelle, Datum, Datentyp
- [ ] „Was hat sich geändert seit letztem Besuch"-Indikator pro Quartal
- [ ] Performance: Suche unter 3 s bei > 1 000 gespeicherten Dokumenten
- [ ] KI-Analysen (REQ-008) werden in der Timeline archiviert und sind über Datum auffindbar

#### Verifikation
`curl "http://localhost:3000/api/depot/AAPL/history?type=report&from=2024-01-01"` → gefilterte Liste mit Feldern `type`, `period`, `content`, `source`, `createdAt`

#### Explizit Out-of-Scope (MVP)
- Semantische / natürlichsprachliche Suche → Phase 2
- Embedding-Pipeline / Vektorstore → Phase 2

> ⚠️ **Möglicher Widerspruch mit REQ-008:** REQ-008 fordert, dass KI-Agenten „ausschließlich auf gespeicherte Daten der Aktie zugreifen" und setzt damit eine valide Datenbasis voraus. REQ-005 lässt leere Quartale explizit zu. Wie Agenten mit lückenhaften Daten umgehen (Abbruch, Kennzeichnung, Hinweis), muss in der Architekturphase definiert werden.

---

### REQ-006: Web-Frontend mit Aufmerksamkeits-Dashboard

- **Status:** open
- **Priorität:** P0
- **Größe:** L
- **Abhängig von:** REQ-001, REQ-002, REQ-003

#### Beschreibung
Webbasierte Single-Page-Application als einziger Zugangskanal. Single-User, startet lokal mit einem einzigen Befehl. Das Dashboard ist keine gleichförmige Liste, sondern sortiert Aktien nach Handlungsbedarf: Positionen mit neuen Daten, Anomalien oder Kursveränderungen > 5 % treten optisch hervor; ruhige Positionen treten zurück. Beim Öffnen nach einer Nutzungspause wird eine kompakte „Seit deinem letzten Besuch"-Zusammenfassung eingeblendet.

#### Akzeptanzkriterien
- [ ] Dashboard zeigt alle Depot-Aktien: Name, Ticker, Kurs, Tagesveränderung (%)
- [ ] Sortierung standardmäßig nach „Handlungsbedarf" (neue Daten, Anomalien, Kursänderungen > 5 % oben)
- [ ] Aktien mit neuen Recherche-Ergebnissen oder Kennzahl-Anomalien tragen einen visuellen Indikator (Badge, Farbton)
- [ ] Ruhige Aktien ohne neue Daten sind visuell dezenter dargestellt
- [ ] Alternative Sortierungen wählbar: alphabetisch, Performance (wenn Kaufdaten vorhanden), Hinzufügedatum
- [ ] „Seit deinem letzten Besuch [Datum]"-Zusammenfassung beim Öffnen: neue Reports, Kursveränderungen > 5 %
- [ ] Depot-Gesamtwert sichtbar wenn Kaufdaten gepflegt sind; sonst Anzahl Positionen
- [ ] Klick auf Aktie öffnet Detailseite (Timeline, Kennzahlen, News, KI-Analysen, Burggraben)
- [ ] Aktie-Hinzufügen direkt vom Dashboard möglich
- [ ] Leeres Depot: Onboarding-Hinweis statt leerem Bildschirm
- [ ] Responsive Design (Desktop-first; Kernfunktionen auf 375 px Breite nutzbar)
- [ ] Ladezeit Dashboard < 2 s
- [ ] Anwendung startet lokal mit einem einzigen Befehl (z.B. `npm start`)

#### Verifikation
`npm start` → kein Fehler-Exit-Code; `curl http://localhost:3000` antwortet mit HTTP 200 in < 2 s

---

### REQ-007: Burggraben-Analyse (Moat Assessment)

- **Status:** open
- **Priorität:** P1
- **Größe:** M
- **Abhängig von:** REQ-003

#### Beschreibung
Strukturierte Burggraben-Einschätzung pro Aktie mit fünf Standardkategorien. Die KI generiert eine initiale Bewertung auf Basis der gespeicherten Recherche-Ergebnisse; der Nutzer kann jede Kategorie überschreiben oder kommentieren. Alle Änderungen werden versioniert, sodass die Entwicklung der Einschätzung über Zeit nachvollziehbar bleibt. Das Feature ist kein reiner KI-Output, sondern ein kollaborativer Analyse-Baustein.

#### Akzeptanzkriterien
- [ ] Fünf Kategorien: Markenstärke, Netzwerkeffekte, Kostenvorteile, Wechselkosten, regulatorische Vorteile
- [ ] Bewertung pro Kategorie: stark / mittel / schwach / nicht vorhanden — mit Begründungstext
- [ ] KI generiert initiale Bewertung auf Basis der gespeicherten Daten der Aktie
- [ ] Nutzer kann KI-Bewertung pro Kategorie überschreiben oder kommentieren
- [ ] Gesamteinschätzung (wide / narrow / no moat) wird aus Einzelbewertungen abgeleitet
- [ ] Änderungshistorie sichtbar: „KI: stark am [Datum] → Nutzer: mittel am [Datum]"
- [ ] Quellen für jede Einschätzung nachvollziehbar (referenziert auf gespeicherte Datenpunkte)

#### Verifikation
`curl http://localhost:3000/api/depot/AAPL/moat` → Objekt mit Feldern `categories` (Array), `overallRating`, `lastUpdated`, `history` (Array von Änderungen)

---

### REQ-008: KI-Analysebericht (Multi-Agenten)

- **Status:** open
- **Priorität:** P1
- **Größe:** L
- **Abhängig von:** REQ-004, REQ-005

#### Beschreibung
Per explizitem Trigger wird ein strukturierter Analysebericht aus drei KI-Perspektiven generiert: Fundamentalanalyst, Burggraben-Experte, Bären-/Risiko-Perspektive. V1 ist kein Live-Chat, sondern ein lesbarer Bericht mit klar getrennten Abschnitten — das senkt das UX-Risiko erheblich und erfordert kein neues mentales Modell. Jeder Agent referenziert ausschließlich gespeicherte Datenpunkte der Aktie. Die Diskussion endet nach maximal N Runden (konfigurierbar, Default 5) mit einer konsolidierten Zusammenfassung. Ein klickbarer UX-Prototyp muss mit 3–5 Nutzern validiert werden, bevor die Backend-Implementierung startet.

#### Akzeptanzkriterien
- [ ] Button „Analyse generieren" pro Aktie; nur aktiv wenn mindestens 2 Quartale Datenbasis vorliegen
- [ ] Vor dem Start: Kurzerklärung (max. 2 Sätze) + geschätzte Dauer (z.B. „ca. 30–60 s")
- [ ] Drei Perspektiven: Fundamentalanalyst, Burggraben-Experte, Bären-/Risiko-Perspektive
- [ ] Jeder Abschnitt referenziert konkrete gespeicherte Datenpunkte mit Quellenangabe (keine unbelegten Aussagen)
- [ ] Ergebnis: Strukturierter Bericht mit klar getrennten, semantisch markierten Perspektiv-Abschnitten
- [ ] Konsolidierte Zusammenfassung am Ende: Kernthesen, Konsens- und Dissenz-Punkte
- [ ] Diskussion endet nach max. N Runden (Default 5, konfigurierbar)
- [ ] Nutzer kann laufende Diskussion abbrechen ohne Datenverlust; Teilergebnis bleibt gespeichert
- [ ] Bericht wird in der Timeline (REQ-005) archiviert
- [ ] Bewusst nicht in V1 enthalten: Live-Chat, Rückfragen des Nutzers während Diskussion, interaktiver Verlauf
- [ ] **Voraussetzung vor Backend-Implementierung:** Klick-Prototyp mit 3–5 Nutzern getestet und validiert

#### Verifikation
`curl -X POST http://localhost:3000/api/depot/AAPL/analysis` → `{"id":"...","status":"running","estimatedSeconds":45}`; nach Abschluss: `GET /api/depot/AAPL/analysis/:id` → Objekt mit Feldern `perspectives` (Array mit `role`, `content`, `datapointsReferenced`), `summary`, `consensusPoints`, `dissentPoints`, `archivedAt`

> ⚠️ **Möglicher Widerspruch mit REQ-005:** REQ-008 setzt eine vollständige Datenbasis voraus (Agenten greifen „ausschließlich auf gespeicherte Daten" zu). REQ-005 lässt leere Quartale explizit zu. Was ein Agent tut, wenn für ein Quartal keine Daten vorliegen (Abbruch, Kennzeichnung als Lücke, Hinweis im Bericht), ist nicht spezifiziert und muss in der Architekturphase entschieden werden.

---

### REQ-009: Kostentransparenz und -begrenzung

- **Status:** open
- **Priorität:** P1
- **Größe:** S
- **Abhängig von:** REQ-003, REQ-008

#### Beschreibung
Jede KI-Operation (Recherche, Analyse) verursacht API-Kosten. Ohne Transparenz entsteht entweder Nutzungsangst (Feature wird nie genutzt) oder unerwartete Rechnungen (Vertrauensverlust). Nutzer sehen vor kostenpflichtigen Operationen eine Schätzung und können ein optionales monatliches Budget-Limit konfigurieren.

#### Akzeptanzkriterien
- [ ] Vor jeder Recherche und Analyse-Operation: geschätzter Token-Verbrauch und Kostenäquivalent in EUR angezeigt
- [ ] Kumulative Kosten pro Tag / Woche / Monat in den Einstellungen einsehbar
- [ ] Optionales Budget-Limit konfigurierbar (z.B. „max. 20 € / Monat") mit Warnung bei Erreichen von 80 %
- [ ] Abgebrochene Operationen werden anteilig erfasst (kein Nullwert bei Abbruch)
- [ ] Kostenübersicht ist dauerhaft in den App-Einstellungen zugänglich

#### Verifikation
`curl http://localhost:3000/api/costs/summary` → `{"today":{"tokens":4200,"estimatedEur":0.12},"month":{"tokens":82000,"estimatedEur":2.35},"budgetLimit":20,"budgetUsedPercent":11.7}`

---

### REQ-010: Kauf-/Verkaufshistorie und Performance-Tracking

- **Status:** open
- **Priorität:** P2
- **Größe:** M
- **Abhängig von:** REQ-001, REQ-002

#### Beschreibung
Optional erfassbare Transaktionsdaten ergänzen das Analyse-Werkzeug um Performance-Tracking. Positionen ohne Kaufdaten bleiben vollständig funktional (Watchlist-Modus). Realisierte Gewinne und Verluste werden nur für Positionen mit vollständiger Transaktionshistorie berechnet. Das Tool ist primär ein Analyse-Gedächtnis, kein Brokerage-Ersatz — deshalb ist dieses Feature P2.

#### Akzeptanzkriterien
- [ ] Kauf erfassbar: Datum, Stückzahl, Kaufpreis, Währung, optionale Gebühren
- [ ] Teilverkäufe erfassbar: Datum, Stückzahl, Verkaufspreis
- [ ] Realisierter Gewinn/Verlust berechnet pro Position und gesamt
- [ ] Dividendenzahlungen erfassbar: Datum, Betrag pro Aktie
- [ ] Geschlossene Positionen bleiben in der Datenhistorie sichtbar, visuell von offenen Positionen abgegrenzt
- [ ] Währungsumrechnung: Transaktionen in Fremdwährung, Performance-Anzeige wahlweise in EUR

#### Verifikation
`curl -X POST http://localhost:3000/api/depot/AAPL/transactions -d '{"type":"buy","date":"2024-03-15","shares":10,"price":175.50,"currency":"USD"}'` → `{"transactionId":"...","unrealizedGainEur":72.30}`