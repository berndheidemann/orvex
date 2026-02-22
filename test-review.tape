Output test-review.gif
Set FontSize 13
Set Width 1400
Set Height 780
Set Padding 20

# Frisches Test-Verzeichnis
Hide
Type "rm -rf /tmp/kinema-review-test && mkdir -p /tmp/kinema-review-test"
Enter
Sleep 1s
Show

Env KINEMA_INIT_MODE "1"
Env KINEMA_INIT_DESCRIPTION "Prüfungstrainer für die AP1 IT-Berufe"
Env KINEMA_INIT_MODEL "claude-haiku-4-5-20251001"
Env KINEMA_INIT_ROUNDS "1"

Type "cd /tmp/kinema-review-test && /Users/berndheidemann/Developer/sonstige/kinema-agentic-workflow/dev/kinema-tui"
Enter

# ── PRD-Phase ──────────────────────────────────────────────────
# Runde 1 läuft (Haiku, 3 Agenten parallel)
Sleep 5s
Screenshot test-r01-prd-running.png

# Warten bis PRD-Synthese fertig
# Agenten: ~54s, Sonnet-Synthese: ~225s → ~280s gesamt
# Mit Puffer auf 320s warten
Sleep 320s
Screenshot test-r02-prd-synth-done.png

# ── PRD Synth Done Screen ──────────────────────────────────────
Sleep 2s
Enter

# ── PRD Review ─────────────────────────────────────────────────
Sleep 0.5s
Screenshot test-r03-review-req1.png

# Etwas nach unten scrollen
Down
Down
Down
Down
Screenshot test-r04-req1-scrolled.png
Sleep 0.5s

# REQ 1: Editor öffnen (e)
Type "e"
Sleep 1s
Screenshot test-r05-editor-open.png

# Cursor ans Ende der ersten Zeile, Zusatz tippen
Ctrl+E
Sleep 0.3s
Type " [WICHTIG: Prüfungsrelevanz hoch]"
Sleep 0.5s
Screenshot test-r06-editor-edited.png

# Speichern
Ctrl+S
Sleep 0.5s
Screenshot test-r07-req1-after-edit.png

# ── REQ 2: Opus-Rewrite ────────────────────────────────────────
Enter
Sleep 0.3s
Screenshot test-r08-req2-view.png

# Opus-Rewrite mit [r] starten
Type "r"
Sleep 0.3s
Screenshot test-r09-typing-mode.png

# Prompt eintippen
Type "Kürze die Beschreibung auf maximal 2 kurze Sätze"
Sleep 0.3s
Screenshot test-r10-prompt-typed.png

# Abschicken
Enter
Sleep 0.5s
Screenshot test-r11-rewriting-spinner.png

# Warten bis Opus fertig (≈ 60-90s)
Sleep 80s
Screenshot test-r12-req2-rewritten.png
Sleep 1s

# ── Restliche REQs durchklicken (großzügig viele Enters) ───────
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s

# ── Arch-Bestätigung ───────────────────────────────────────────
Sleep 1s
Screenshot test-r13-arch-confirm.png
Type "j"

# ── Arch-Phase ─────────────────────────────────────────────────
Sleep 5s
Screenshot test-r14-arch-running.png

# Warten bis Arch-Synthese fertig (ähnliche Zeiten wie PRD)
Sleep 320s
Screenshot test-r15-arch-synth-done.png

# ── Arch Synth Done Screen (scrollable) ────────────────────────
Sleep 2s

# Etwas scrollen
Down
Down
Down
Down
Down
Sleep 0.5s
Screenshot test-r16-arch-scrolled.png

# Review starten
Enter
Sleep 0.5s
Screenshot test-r17-adr1-view.png

# Etwas scrollen
Down
Down
Screenshot test-r18-adr1-scrolled.png
Sleep 0.5s

# ADR 1 durchblättern
Enter
Sleep 0.3s
Screenshot test-r19-adr2-view.png

# Noch ein paar ADRs bestätigen
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter
Sleep 0.3s
Enter

# ── Fertig ─────────────────────────────────────────────────────
Sleep 2s
Screenshot test-r20-done.png
