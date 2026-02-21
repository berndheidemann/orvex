#!/bin/bash

# Kinema Agent Loop
# Iteriert über Requirements in PRD.md mit Claude Code
# Sonnet implementiert, Opus wird via Task-Tool für Entscheidungen gerufen.
#
# Usage:
#   ./loop.sh              # Unlimited iterations
#   ./loop.sh 20           # Max 20 iterations
#
# Env vars:
#   ITER_TIMEOUT=N         # Iteration timeout in seconds (default: 1800)
#   SAFE_BRANCH=0          # Disable automatic agent branch creation
#   SANDBOX_MODE=1         # Skip environment checks (project-specific)
#   VALIDATOR_TIMEOUT=N    # Timeout for validation (default: 2400)
#   REFACTOR=1             # Run refactoring review mode (once, then exit)
#   FULL_VERIFY=1          # Force full verification every iteration
#   DEV_PORTS=3000,5173    # Ports to clean up between iterations

set -euo pipefail

# ── Lock file (PID-based, macOS-compatible) ──────────────────────
mkdir -p .agent
LOCKFILE=".agent/loop.lock"
if [ -f "$LOCKFILE" ]; then
  _lock_pid=$(cat "$LOCKFILE" 2>/dev/null || echo "")
  if [ -n "$_lock_pid" ] && kill -0 "$_lock_pid" 2>/dev/null; then
    echo "Error: Loop already running (PID: $_lock_pid, lockfile: $LOCKFILE)"
    exit 1
  fi
  rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"

# ── Colors ──────────────────────────────────────────────────────
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
BLUE='\033[0;34m'
RESET='\033[0m'

# ── Args ────────────────────────────────────────────────────────
MAX_ITERATIONS=0
ITERATION=0
TOTAL_COST=0
LOOP_START=$(date +%s)
PRD_FILE="PRD.md"
MODEL="sonnet"
PROMPT_FILE="AGENT.md"
ITER_TIMEOUT="${ITER_TIMEOUT:-1800}"  # 30 min default, override via env
SAFE_BRANCH="${SAFE_BRANCH:-1}"       # Auto-create agent branch
SANDBOX_MODE="${SANDBOX_MODE:-0}"     # Skip environment checks
FULL_VERIFY_OVERRIDE="${FULL_VERIFY:-0}"
STATUS_JSON=".agent/status.json"
ORIGINAL_BRANCH=""
AGENT_BRANCH=""
VALIDATOR_PROMPT_FILE="VALIDATOR.md"
VALIDATOR_MODEL="opus"
VALIDATE_INTERVAL=5              # Default: validate every 5 iterations
ITERS_SINCE_VALIDATION=0         # Counter since last validation
VALIDATOR_TIMEOUT="${VALIDATOR_TIMEOUT:-2400}"  # 40 min for validator
REFACTOR="${REFACTOR:-0}"        # Refactoring-Review-Modus (once, then exit)
REFACTOR_PROMPT_FILE="REFACTOR.md"
REFACTOR_MODEL="opus"
REFACTOR_TIMEOUT="${REFACTOR_TIMEOUT:-2400}"
DEV_PORTS="${DEV_PORTS:-}"       # Comma-separated list of ports to clean up

for arg in "$@"; do
  case "$arg" in
    [0-9]*) MAX_ITERATIONS="$arg" ;;
    -h|--help)
      echo -e "${BOLD}Kinema Agent Loop${RESET}"
      echo ""
      echo "Usage: ./loop.sh [N]"
      echo ""
      echo "Arguments:"
      echo "  N              Max N iterations (default: unlimited)"
      echo "  -h, --help     Show this help"
      echo ""
      echo -e "${BOLD}How it works:${RESET}"
      echo "  1. Sonnet reads .agent/context.md + PRD.md"
      echo "  2. Selects the next open requirement (P0 > P1 > P2)"
      echo "  2.5. Opus plans the implementation (for M-sized REQs)"
      echo "  3. Implements it (code, tests) → WIP checkpoint commit"
      echo "  4. Verifies (tiered: quick vs full every 3 iterations)"
      echo "  5. Updates PRD.md + .agent/ artifacts, final commit + tag"
      echo "  → Next iteration"
      echo ""
      echo -e "${BOLD}Opus Validation Loop:${RESET}"
      echo "  Every 5 iterations (dynamic: 3 after issues) Opus checks:"
      echo "  - Whether done-REQs actually work"
      echo "  - Whether the agent bypassed rules (log analysis)"
      echo "  - Can reset REQs (done → open) or block them"
      echo ""
      echo -e "${BOLD}Output:${RESET}"
      echo "  Compact stream with color-coded tool calls:"
      echo -e "    ${GREEN}Read/Glob/Grep${RESET}  ${YELLOW}Edit/Write/Bash${RESET}  ${MAGENTA}Playwright${RESET}"
      echo -e "    ${BOLD}Task${RESET} ${MAGENTA}[opus]${RESET}  ${BLUE}[sonnet]${RESET}  ${GREEN}[haiku]${RESET}"
      echo "  + Cost tracking per iteration and cumulated"
      echo "  + Model usage breakdown (tokens, cache, costs)"
      echo ""
      echo -e "${BOLD}Automatic stops:${RESET}"
      echo "  - All requirements done"
      echo "  - Max iterations reached"
      echo "  - Iteration timeout (default: 30 min, ITER_TIMEOUT=N)"
      echo "  - 2x low-activity (≤5 tools, not blocked) in a row"
      echo "  - Ctrl+C (shows summary)"
      echo ""
      echo -e "${BOLD}Env variables:${RESET}"
      echo "  ITER_TIMEOUT=N      Timeout per iteration in seconds (default: 1800)"
      echo "  SAFE_BRANCH=0       Disable agent branch creation"
      echo "  FULL_VERIFY=1       Force full verification"
      echo "  SANDBOX_MODE=1      Skip environment checks (project-specific)"
      echo "  VALIDATOR_TIMEOUT=N Timeout for validation in seconds (default: 2400)"
      echo "  REFACTOR=1          Start refactoring review (once, then exit)"
      echo "  REFACTOR_TIMEOUT=N  Timeout for refactoring review (default: 2400)"
      echo "  DEV_PORTS=3000,5173 Comma-separated ports to kill between iterations"
      echo ""
      echo -e "${BOLD}Refactoring-Review (REFACTOR=1):${RESET}"
      echo "  Opus analyzes the codebase on 7 dimensions:"
      echo "    Redundancy, Separation of Concerns, Performance, Dead Code,"
      echo "    Type safety, Extensibility, Maintainability"
      echo "  Output: .agent/refactor-backlog.md — prioritized list (P0/P1/P2)"
      echo "  Loop exits afterwards (no REQ mode)."
      echo ""
      echo -e "${BOLD}Files:${RESET}"
      echo "  AGENT.md                    Loop instructions for the agent"
      echo "  VALIDATOR.md                Opus validation prompt"
      echo "  REFACTOR.md                 Opus refactoring review prompt"
      echo "  .agent/logs/                Stream-JSON logs per iteration"
      echo "  .agent/refactor-backlog.md  Refactoring backlog (Opus output)"
      echo "  PRD.md                      Requirements with status + dependencies"
      echo "  .agent/status.json          Machine-readable REQ status (authoritative)"
      echo "  .agent/context.md           Short project context (50 lines, rewrite)"
      echo "  .agent/architecture.md      Architecture decisions (append-only ADRs)"
      echo "  .agent/learnings.md         Persistent insights (append-only)"
      echo "  .agent/iterations.jsonl     Iteration log (append)"
      echo ""
      echo -e "${BOLD}Examples:${RESET}"
      echo "  ./loop.sh             # Runs until all REQs done"
      echo "  ./loop.sh 5           # Max 5 iterations"
      echo "  REFACTOR=1 ./loop.sh  # One-time refactoring review → .agent/refactor-backlog.md"
      exit 0
      ;;
  esac
done

if [ ! -f "$PROMPT_FILE" ]; then
  echo -e "${RED}Error: $PROMPT_FILE not found${RESET}"
  exit 1
fi

# ── Duration formatting ────────────────────────────────────
format_duration() {
  local secs=$1
  if [ "$secs" -ge 3600 ]; then
    printf "%dh %02dm %02ds" $((secs/3600)) $((secs%3600/60)) $((secs%60))
  elif [ "$secs" -ge 60 ]; then
    printf "%dm %02ds" $((secs/60)) $((secs%60))
  else
    printf "%ds" "$secs"
  fi
}

# ── Status JSON helpers ────────────────────────────────────────
# status.json is the authoritative source for REQ status.
# loop.sh reads from it; the agent writes to it.

init_status_json() {
  # Generate status.json from PRD.md if it doesn't exist
  [ -f "$STATUS_JSON" ] && return
  mkdir -p .agent

  local awk_tmp
  awk_tmp=$(mktemp)
  cat > "$awk_tmp" << 'AWKEOF'
/^### REQ-/ {
  if (req != "") printf "%s\t%s\t%s\t%s\t%s\n", req, status, prio, size, deps
  req = $2; sub(/:$/, "", req); sub(/:/, "", req)
  status = "open"; prio = "P2"; size = "M"; deps = "---"
}
/^- [*][*]Status/ {
  s = $0; sub(/.*Status:[*][*] */, "", s); sub(/[[:space:]]*$/, "", s); status = s
}
/^- [*][*]Priorit/ {
  s = $0; sub(/.*t:[*][*] */, "", s); sub(/[[:space:]]*$/, "", s); prio = s
}
/^- [*][*]Gr/ {
  s = $0; sub(/.*e:[*][*] */, "", s); sub(/[[:space:]]*$/, "", s); size = s
}
/^- [*][*]Abh/ {
  s = $0; sub(/.*von:[*][*] */, "", s); sub(/[[:space:]]*$/, "", s); deps = s
}
END {
  if (req != "") printf "%s\t%s\t%s\t%s\t%s\n", req, status, prio, size, deps
}
AWKEOF
  awk -f "$awk_tmp" "$PRD_FILE" | jq -Rn '
    [inputs | split("\t") | select(length >= 5)] |
    map({
      key: .[0],
      value: {
        status: .[1],
        priority: .[2],
        size: .[3],
        deps: (
          .[4] |
          if . == "\u2014" or . == "---" or . == "-" or . == "" then []
          else [split(",") | .[] | gsub("^\\s+|\\s+$"; "") | select(startswith("REQ-"))]
          end
        )
      }
    }) | from_entries
  ' > "$STATUS_JSON"

  rm -f "$awk_tmp"
  echo -e "  ${DIM}Initialized $STATUS_JSON from $PRD_FILE${RESET}"
}

count_open_reqs() {
  jq '[.[] | select(.status == "open")] | length' "$STATUS_JSON" 2>/dev/null || echo "0"
}

count_done_reqs() {
  jq '[.[] | select(.status == "done")] | length' "$STATUS_JSON" 2>/dev/null || echo "0"
}

count_total_reqs() {
  jq 'length' "$STATUS_JSON" 2>/dev/null || echo "0"
}

count_in_progress_reqs() {
  jq '[.[] | select(.status == "in_progress")] | length' "$STATUS_JSON" 2>/dev/null || echo "0"
}

# ── Status JSON validation (protect against crash corruption) ─
validate_status_json() {
  [ -f "$STATUS_JSON" ] && jq empty "$STATUS_JSON" 2>/dev/null
}

recover_status_json() {
  if ! validate_status_json; then
    echo -e "  ${RED}status.json corrupted — attempting recovery${RESET}"
    if git checkout HEAD -- "$STATUS_JSON" 2>/dev/null && validate_status_json; then
      echo -e "  ${GREEN}Recovered status.json from last commit${RESET}"
    else
      echo -e "  ${YELLOW}Reinitializing status.json from PRD.md${RESET}"
      rm -f "$STATUS_JSON"
      init_status_json
    fi
  fi
}

# ── Temp files for extraction from pipeline subshell ──────────
COST_FILE=$(mktemp)
TOOLS_FILE=$(mktemp)
STATUS_FILE=$(mktemp)
EXIT_FILE=$(mktemp)
ITER_LOG=".agent/iterations.jsonl"
CONTEXT_FILE=".agent/context.md"
LOG_DIR=".agent/logs"
mkdir -p "$LOG_DIR"

# ── Crash recovery ───────────────────────────────────────────
# Reset any in_progress REQs from crashed previous iterations
recover_in_progress() {
  local count
  count=$(count_in_progress_reqs)
  if [ "$count" -gt 0 ]; then
    echo -e "  ${YELLOW}Crash recovery: $count REQ(s) stuck in 'in_progress' → resetting to 'open'${RESET}"
    jq 'map_values(if .status == "in_progress" then .status = "open" else . end)' \
      "$STATUS_JSON" > "${STATUS_JSON}.tmp" && mv "${STATUS_JSON}.tmp" "$STATUS_JSON"
    sed -i 's/^\- \*\*Status:\*\* in_progress/- **Status:** open/' "$PRD_FILE"
    git add "$STATUS_JSON" "$PRD_FILE" && \
      git commit -m "loop.sh: crash recovery — reset in_progress REQs to open" 2>/dev/null || true
  fi
}

# ── PRD pre-parsing (dependency validation) ──────────────────
# Uses status.json for status + dependency checks, PRD.md only for display text

get_next_req_id() {
  # Find next open REQ where all deps are done, sorted by priority then ID
  jq -r '
    . as $all |
    to_entries |
    map(select(.value.status == "open")) |
    map(select(
      .value.deps | length == 0 or all(. as $d | $all[$d].status == "done")
    )) |
    sort_by(
      (.value.priority | if . == "P0" then 0 elif . == "P1" then 1 else 2 end),
      .key
    ) |
    first | .key // empty
  ' "$STATUS_JSON" 2>/dev/null
}

get_next_req_hint() {
  local req_id
  req_id=$(get_next_req_id)
  [ -z "$req_id" ] && return
  grep "^### ${req_id}:" "$PRD_FILE" 2>/dev/null | head -1
}

get_next_req_block() {
  local hint
  hint=$(get_next_req_hint)
  [ -z "$hint" ] && return
  awk -v title="$hint" '
    $0 == title { found=1 }
    found && /^(### REQ-|^---)/ && $0 != title { exit }
    found { print }
  ' "$PRD_FILE"
}

extract_backlog_p0() {
  local backlog=".agent/refactor-backlog.md"
  [ -f "$backlog" ] || return
  awk '/^## P0/{ found=1; next } found && /^## P[0-9]$/{ exit } found{ print }' "$backlog" | \
    head -60
}

build_agent_prompt() {
  cat "$PROMPT_FILE"
  local req_block
  req_block=$(get_next_req_block)
  if [ -n "$req_block" ]; then
    echo ""
    echo "---"
    echo ""
    echo "## Injected Context (from loop.sh)"
    echo ""
    echo "Next open requirement based on PRD analysis (dependencies checked):"
    echo ""
    echo "$req_block"
    echo ""
    if [ -f "$CONTEXT_FILE" ]; then
      echo "### Current Project Context (.agent/context.md):"
      echo ""
      cat "$CONTEXT_FILE"
      echo ""
    fi
    local backlog_p0
    backlog_p0=$(extract_backlog_p0)
    if [ -n "$backlog_p0" ]; then
      echo "### Refactoring Backlog P0 (optional, when convenient):"
      echo ""
      echo "> If you're touching affected files anyway, fix the item in passing."
      echo "> After fix: remove the RF entry from \`.agent/refactor-backlog.md\`."
      echo "> No separate status block needed — only if it fits naturally."
      echo "> The REQ always has priority."
      echo ""
      echo "$backlog_p0"
      echo ""
    fi
    echo "Still read .agent/context.md and PRD.md yourself — this pre-selection is a hint, not a guarantee."
  fi
}

# ── Log summarizer ───────────────────────────────────────────
summarize_log() {
  local logfile="$1"
  [ -f "$logfile" ] || return 0
  local tool_count exit_code cost cost_fmt top_tools iter_num
  tool_count=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' "$logfile" 2>/dev/null | wc -l | tr -d ' ')
  exit_code=$(jq -r 'select(.type=="result") | .exit_code // 1' "$logfile" 2>/dev/null | tail -1)
  cost=$(jq -r 'select(.type=="result") | .total_cost_usd // 0' "$logfile" 2>/dev/null | tail -1)
  cost_fmt=$(echo "${cost:-0}" | awk '{printf "%.2f", $1+0}')
  top_tools=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") | .name' "$logfile" 2>/dev/null | sort | uniq -c | sort -rn | head -3 | awk '{printf "%s(%s) ",$2,$1}')
  iter_num=$(basename "$logfile" .jsonl | grep -Eo '[0-9]+$' || echo "?")
  echo "**Iter ${iter_num}**: ${tool_count:-0} tools, \$${cost_fmt}, exit=${exit_code:-1}"
  echo "  Top tools: ${top_tools:-none}"
}

# ── Validator prompt builder ──────────────────────────────────
build_validator_prompt() {
  cat "$VALIDATOR_PROMPT_FILE"
  echo ""
  echo "---"
  echo ""
  echo "## Injected Context (from loop.sh)"
  echo ""
  echo "### Last $ITERS_SINCE_VALIDATION iterations — log summaries"
  echo ""

  local count=0
  for logfile in $(ls -t "$LOG_DIR"/iter-*.jsonl 2>/dev/null | head -"$ITERS_SINCE_VALIDATION" | sort); do
    if [ -f "$logfile" ]; then
      echo "---"
      echo ""
      summarize_log "$logfile"
      echo ""
      count=$((count + 1))
    fi
  done

  if [ "$count" -eq 0 ]; then
    echo "_No iteration logs available._"
  fi

  echo ""
  echo "### Current Status"
  echo ""
  echo "REQs done: $(count_done_reqs)/$(count_total_reqs)"
  echo "REQs open: $(count_open_reqs)"
  echo ""
}

# ── Dev server / process cleanup ───────────────────────────────
kill_dev_servers() {
  if [ -z "$DEV_PORTS" ]; then
    return
  fi
  local ports_arg
  ports_arg=$(echo "$DEV_PORTS" | tr ',' '\n' | paste -sd ',' -)
  local pids
  pids=$(lsof -ti:"$ports_arg" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo -e "  ${DIM}Cleaning up leftover processes on ports ${DEV_PORTS}${RESET}"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

# ── Iterations log — JSONL ─────────────────────────────────────
append_iteration_log() {
  local iter=$1 duration=$2 cost=$3 tools=$4 exit_code=$5
  local req_hint="${NEXT_REQ_HINT:-unknown}"
  req_hint="${req_hint#'### '}"
  local status_content
  status_content=$(cat "$STATUS_FILE" 2>/dev/null || echo "")

  jq -nc \
    --argjson iter "$iter" \
    --arg timestamp "$(date -Iseconds)" \
    --argjson duration "$duration" \
    --arg cost "$cost" \
    --argjson tools "$tools" \
    --argjson exit_code "$exit_code" \
    --arg reqs_done "$(count_done_reqs)/$(count_total_reqs)" \
    --arg req_hint "$req_hint" \
    --arg status_block "$status_content" \
    '{
      iteration: $iter,
      timestamp: $timestamp,
      duration_s: $duration,
      cost: $cost,
      tools: $tools,
      exit_code: $exit_code,
      reqs_done: $reqs_done,
      req_hint: $req_hint,
      status_block: $status_block
    }' >> "$ITER_LOG"
}

# ── Git tags ─────────────────────────────────────────────────
tag_iteration() {
  local iter=$1
  local req_hint="${NEXT_REQ_HINT:-unknown}"
  local req_id
  req_id=$(echo "$req_hint" | grep -Eo 'REQ-[0-9]+[a-z]?' | head -1 || echo "unknown")
  local tag_name="iter-${iter}-${req_id}"
  if git rev-parse --verify HEAD >/dev/null 2>&1; then
    git tag -f "$tag_name" HEAD 2>/dev/null && \
      echo -e "  ${DIM}Tagged: ${tag_name}${RESET}" || true
  fi
}

# ── Agent branch setup ────────────────────────────────────────
setup_agent_branch() {
  if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
    return  # Not a git repo or no commits
  fi

  ORIGINAL_BRANCH=$(git branch --show-current 2>/dev/null || echo "")

  if [ "$SAFE_BRANCH" = "1" ] && { [ "$ORIGINAL_BRANCH" = "main" ] || [ "$ORIGINAL_BRANCH" = "master" ]; }; then
    AGENT_BRANCH="agent/loop-$(date +%Y%m%d-%H%M)"
    echo -e "  ${YELLOW}On $ORIGINAL_BRANCH — creating branch $AGENT_BRANCH for safe iteration${RESET}"
    git checkout -b "$AGENT_BRANCH"
  else
    AGENT_BRANCH="$ORIGINAL_BRANCH"
  fi
}

# ── Summary & cleanup ─────────────────────────────────────────
print_summary() {
  local elapsed=$(( $(date +%s) - LOOP_START ))
  local elapsed_fmt
  elapsed_fmt=$(format_duration "$elapsed")
  local total_fmt
  total_fmt=$(LC_NUMERIC=C awk "BEGIN{printf \"%.4f\", ${TOTAL_COST:-0}}")
  echo ""
  echo -e "${BOLD}━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "  Iterations : ${ITERATION}"
  echo -e "  Total cost : ${BOLD}\$${total_fmt}${RESET}"
  echo -e "  Total time : ${elapsed_fmt}"
  echo -e "  REQs done  : $(count_done_reqs)/$(count_total_reqs)"
  echo -e "  REQs open  : $(count_open_reqs)"
  if [ -n "$AGENT_BRANCH" ] && [ "$AGENT_BRANCH" != "$ORIGINAL_BRANCH" ]; then
    echo -e "  Branch     : ${CYAN}$AGENT_BRANCH${RESET}"
    echo -e "  ${DIM}Review and merge:${RESET}"
    echo -e "  ${DIM}  git log $ORIGINAL_BRANCH..$AGENT_BRANCH --oneline${RESET}"
    echo -e "  ${DIM}  git merge $AGENT_BRANCH${RESET}"
  fi
}

return_to_original_branch() {
  if [ -n "$ORIGINAL_BRANCH" ] && [ "$ORIGINAL_BRANCH" != "$AGENT_BRANCH" ]; then
    git checkout "$ORIGINAL_BRANCH" 2>/dev/null || true
    echo -e "  ${DIM}Returned to branch $ORIGINAL_BRANCH${RESET}"
  fi
}

cleanup() {
  echo ""
  echo -e "${YELLOW}Interrupted.${RESET}"
  pkill -P $$ -f "claude" 2>/dev/null || true
  kill_dev_servers
  print_summary
  return_to_original_branch
  rm -f "$COST_FILE" "$TOOLS_FILE" "$STATUS_FILE" "$EXIT_FILE" "$LOCKFILE"
  exit 130
}
trap cleanup EXIT INT TERM

# ── Progress parser ─────────────────────────────────────────────
# Reads stream-json from stdin, shows compact progress.
# Writes iteration cost to $COST_FILE for the parent shell.
parse_progress() {
  local tool_count=0
  local main_model=""
  local capturing_status=0
  local status_buf=""

  while IFS= read -r line; do
    [[ "$line" == "{"* ]] || continue

    local type
    type=$(echo "$line" | jq -r '.type // empty' 2>/dev/null) || continue

    case "$type" in
      system)
        main_model=$(echo "$line" | jq -r '.model // "unknown"' 2>/dev/null)
        local model_short="$main_model"
        case "$main_model" in
          *opus*)   model_short="${MAGENTA}opus${RESET}" ;;
          *sonnet*) model_short="${BLUE}sonnet${RESET}" ;;
          *haiku*)  model_short="${GREEN}haiku${RESET}" ;;
        esac
        echo -e "  ${DIM}model:${RESET} ${model_short}"
        ;;

      assistant)
        # ── Text blocks ──
        local text
        text=$(echo "$line" | jq -r '
          [.message.content[]? | select(.type=="text") | .text] | join("\n")
        ' 2>/dev/null | head -1)
        if [ -n "$text" ]; then
          # ── Capture ===STATUS=== blocks for iteration log ──
          if echo "$text" | grep -q '===STATUS==='; then
            status_buf=$(echo "$text" | sed -n '/===STATUS===/,/===END_STATUS===/p')
            if [ -n "$status_buf" ]; then
              echo "$status_buf" > "$STATUS_FILE"
            fi
          fi

          # Detect blocker/blocked status in agent output
          if echo "$text" | grep -qiE 'status:.*blocked|BLOCKER|blocked by'; then
            echo ""
            echo -e "  ${RED}${BOLD}  ⚠⚠⚠  BLOCKER DETECTED  ⚠⚠⚠${RESET}"
            local display="${text:0:300}"
            [ ${#text} -gt 300 ] && display="${display}…"
            echo -e "  ${RED}${display}${RESET}"
            echo ""
          else
            local display="${text:0:120}"
            [ ${#text} -gt 120 ] && display="${display}…"
            echo -e "  ${DIM}${display}${RESET}"
          fi
        fi

        # ── Tool-use blocks (embedded in assistant content) ──
        local tools_json
        tools_json=$(echo "$line" | jq -c '
          .message.content[]? | select(.type=="tool_use")
        ' 2>/dev/null)

        if [ -n "$tools_json" ]; then
          while IFS= read -r tool_json; do
            [ -z "$tool_json" ] && continue
            tool_count=$((tool_count + 1))

            local tool_name
            tool_name=$(echo "$tool_json" | jq -r '.name // "?"' 2>/dev/null)

            case "$tool_name" in
              Read|Glob|Grep)
                local summary
                summary=$(echo "$tool_json" | jq -r '
                  .input | (.file_path // .pattern // .path // (tostring | .[:80]))
                ' 2>/dev/null)
                echo -e "  ${CYAN}[$tool_count]${RESET} ${GREEN}$tool_name${RESET} ${DIM}${summary}${RESET}"
                ;;
              Edit|Write)
                local summary
                summary=$(echo "$tool_json" | jq -r '.input.file_path // "?"' 2>/dev/null)
                echo -e "  ${CYAN}[$tool_count]${RESET} ${YELLOW}$tool_name${RESET} ${DIM}${summary}${RESET}"
                ;;
              Bash)
                local cmd
                cmd=$(echo "$tool_json" | jq -r '.input.command // "?"' 2>/dev/null)
                local display="${cmd:0:100}"
                [ ${#cmd} -gt 100 ] && display="${display}…"
                echo -e "  ${CYAN}[$tool_count]${RESET} ${YELLOW}Bash${RESET} ${DIM}${display}${RESET}"
                ;;
              Task)
                local task_model task_type task_desc model_color
                task_model=$(echo "$tool_json" | jq -r '.input.model // "opus"' 2>/dev/null)
                task_type=$(echo "$tool_json" | jq -r '.input.subagent_type // "?"' 2>/dev/null)
                task_desc=$(echo "$tool_json" | jq -r '.input.description // (.input.prompt[:60]) // "…"' 2>/dev/null)
                case "$task_model" in
                  haiku)  model_color="${GREEN}" ;;
                  sonnet) model_color="${BLUE}" ;;
                  opus)   model_color="${MAGENTA}" ;;
                  *)      model_color="${DIM}" ;;
                esac
                echo -e "  ${CYAN}[$tool_count]${RESET} ${BOLD}Task${RESET} ${model_color}[$task_model]${RESET} ${DIM}${task_type}${RESET} → ${DIM}${task_desc}${RESET}"
                ;;
              mcp__playwright__*)
                local action="${tool_name#mcp__playwright__}"
                action="${action#browser_}"
                echo -e "  ${CYAN}[$tool_count]${RESET} ${MAGENTA}Playwright${RESET} ${DIM}${action}${RESET}"
                ;;
              mcp__*)
                local short="${tool_name#mcp__}"
                echo -e "  ${CYAN}[$tool_count]${RESET} ${DIM}MCP:${short}${RESET}"
                ;;
              *)
                echo -e "  ${CYAN}[$tool_count]${RESET} ${DIM}$tool_name${RESET}"
                ;;
            esac
          done <<< "$tools_json"
        fi
        ;;

      result)
        local cost duration
        cost=$(echo "$line" | jq -r '.total_cost_usd // 0' 2>/dev/null)
        duration=$(echo "$line" | jq -r '.duration_ms // 0' 2>/dev/null)
        local duration_s=""
        if [ -n "$duration" ] && [ "$duration" != "0" ]; then
          duration_s=$(LC_NUMERIC=C awk "BEGIN{printf \"%.1f\", $duration/1000}")
        fi
        local cost_fmt
        cost_fmt=$(LC_NUMERIC=C awk "BEGIN{printf \"%.4f\", ${cost:-0}}")
        echo -e "  ${DIM}── ${tool_count} tools │ ${duration_s}s │ \$${cost_fmt}${RESET}"

        echo "${cost:-0}" > "$COST_FILE"
        echo "${tool_count}" > "$TOOLS_FILE"

        # ── Per-model usage breakdown from result.modelUsage ──
        local has_usage
        has_usage=$(echo "$line" | jq -r '.modelUsage | length // 0' 2>/dev/null)
        if [ "${has_usage:-0}" -gt 0 ]; then
          echo ""
          echo -e "  ${BOLD}Model Usage${RESET}"
          echo "$line" | jq -r '
            .modelUsage | to_entries[] |
            "\(.key)\t\(.value.costUSD // 0)\t\(.value.inputTokens // 0)\t\(.value.outputTokens // 0)\t\(.value.cacheReadInputTokens // 0)\t\(.value.cacheCreationInputTokens // 0)"
          ' 2>/dev/null | while IFS=$'\t' read -r model mcost min mout mcache_read mcache_create; do
            local model_short="$model"
            local model_color="${DIM}"
            case "$model" in
              *opus*)   model_color="${MAGENTA}"; model_short="opus" ;;
              *sonnet*) model_color="${BLUE}"; model_short="sonnet" ;;
              *haiku*)  model_color="${GREEN}"; model_short="haiku" ;;
            esac
            local mcost_fmt
            mcost_fmt=$(LC_NUMERIC=C awk "BEGIN{printf \"%.4f\", ${mcost:-0}}")
            local mcache_total=$((mcache_read + mcache_create))
            printf "  \033[0m${model_color}%-8s\033[0m  \$%-8s  \033[2min:%-6s out:%-6s cache:%-6s\033[0m\n" \
              "$model_short" "$mcost_fmt" "$min" "$mout" "$mcache_total"
          done
        fi
        ;;
    esac
  done
}

# ── Header ──────────────────────────────────────────────────────
echo ""
SANDBOX_LABEL=""
[ "$SANDBOX_MODE" = "1" ] && SANDBOX_LABEL="  ${YELLOW}SANDBOX${RESET}"
echo -e "${BOLD}Kinema Agent Loop${RESET}  ${DIM}model=${MODEL}  max=$([ "$MAX_ITERATIONS" -eq 0 ] && echo '∞' || echo "$MAX_ITERATIONS")  timeout=$(format_duration "$ITER_TIMEOUT")${RESET}${SANDBOX_LABEL}"

# ── Pre-loop: init + recovery + branch ──────────────────────
init_status_json

echo -e "${DIM}REQs: $(count_done_reqs)/$(count_total_reqs) done, $(count_open_reqs) open${RESET}"
echo ""

recover_in_progress
setup_agent_branch

# ── Refactoring-Review-Modus (REFACTOR=1) ───────────────────────
if [ "$REFACTOR" = "1" ]; then
  if [ ! -f "$REFACTOR_PROMPT_FILE" ]; then
    echo -e "${RED}Error: $REFACTOR_PROMPT_FILE not found${RESET}"
    exit 1
  fi

  echo -e "${BOLD}━━ Refactoring Review ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "  ${MAGENTA}${BOLD}Opus Refactoring Review${RESET} ${DIM}→ .agent/refactor-backlog.md${RESET}"
  echo -e "  ${DIM}Dimensions: Redundancy · SoC · Performance · Dead Code · Types · Extensibility · Maintainability${RESET}"
  echo ""

  REFACTOR_LOG_FILE="$LOG_DIR/refactor-$(date +%Y%m%d-%H%M).jsonl"
  echo "0" > "$COST_FILE"
  echo "0" > "$TOOLS_FILE"

  REFACTOR_START=$(date +%s)
  set +eo pipefail
  (
    timeout --foreground --signal=TERM --kill-after=30 "$REFACTOR_TIMEOUT" \
      claude -p \
        --dangerously-skip-permissions \
        --output-format=stream-json \
        --model "$REFACTOR_MODEL" \
        --max-turns 60 \
        --verbose \
        < "$REFACTOR_PROMPT_FILE"
    echo $? > "$EXIT_FILE"
  ) | tee "$REFACTOR_LOG_FILE" | parse_progress
  set -eo pipefail

  REFACTOR_EXIT=$(cat "$EXIT_FILE" 2>/dev/null || echo "1")
  REFACTOR_COST=$(cat "$COST_FILE" 2>/dev/null || echo "0")
  REFACTOR_END=$(date +%s)
  REFACTOR_DURATION=$((REFACTOR_END - REFACTOR_START))

  echo ""
  refactor_dur_fmt=$(format_duration "$REFACTOR_DURATION")
  refactor_cost_fmt=$(LC_NUMERIC=C awk "BEGIN{printf \"%.4f\", ${REFACTOR_COST}}")
  echo -e "  ${BOLD}⏱  ${refactor_dur_fmt}${RESET}  │  cost: \$${refactor_cost_fmt}"

  if [ "$REFACTOR_EXIT" -eq 0 ] && [ -f ".agent/refactor-backlog.md" ]; then
    echo ""
    echo -e "${GREEN}${BOLD}Refactoring review complete.${RESET}"
    echo -e "  Backlog: ${CYAN}.agent/refactor-backlog.md${RESET}"
    ITEM_COUNT=$(grep -c '^### RF-' .agent/refactor-backlog.md 2>/dev/null || echo "0")
    echo -e "  ${DIM}${ITEM_COUNT} items found${RESET}"
  elif [ "$REFACTOR_EXIT" -eq 124 ]; then
    echo -e "${RED}${BOLD}Refactoring review timed out after $(format_duration "$REFACTOR_TIMEOUT")${RESET}"
  else
    echo -e "${RED}Refactoring review failed (exit: $REFACTOR_EXIT)${RESET}"
  fi

  return_to_original_branch
  rm -f "$COST_FILE" "$TOOLS_FILE" "$STATUS_FILE" "$EXIT_FILE"
  exit 0
fi

# ── Main loop ───────────────────────────────────────────────────
LOW_ACTIVITY_COUNT=0

while :; do
  # Check if all REQs are done
  local_open=$(count_open_reqs)
  local_in_progress=$(count_in_progress_reqs)
  if [ "$local_open" -eq 0 ] && [ "$local_in_progress" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}All requirements done!${RESET}"
    break
  fi

  if [ "$MAX_ITERATIONS" -gt 0 ] && [ "$ITERATION" -ge "$MAX_ITERATIONS" ]; then
    echo -e "${YELLOW}Reached max iterations ($MAX_ITERATIONS). Stopping.${RESET}"
    break
  fi
  ITERATION=$((ITERATION + 1))

  ITER_LABEL="$ITERATION$([ "$MAX_ITERATIONS" -gt 0 ] && echo "/$MAX_ITERATIONS" || true)"

  # ── Determine if this is a validation iteration ──────────────
  IS_VALIDATION=0
  if [ "$((ITERS_SINCE_VALIDATION + 1))" -ge "$VALIDATE_INTERVAL" ] && [ -f "$VALIDATOR_PROMPT_FILE" ]; then
    IS_VALIDATION=1
    ITERS_SINCE_VALIDATION=$((ITERS_SINCE_VALIDATION + 1))
  fi

  if [ "$IS_VALIDATION" -eq 0 ]; then
    ITERS_SINCE_VALIDATION=$((ITERS_SINCE_VALIDATION + 1))

    NEXT_REQ_HINT=$(get_next_req_hint)

    if [ -z "$NEXT_REQ_HINT" ] && [ "$local_open" -gt 0 ]; then
      echo -e "${YELLOW}${BOLD}No actionable REQ: $local_open open but all have unmet dependencies. Stopping.${RESET}"
      break
    fi
  fi

  if [ "$IS_VALIDATION" -eq 1 ]; then
    echo -e "${BOLD}━━ Validation ${ITER_LABEL} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "  ${MAGENTA}${BOLD}Opus Validation Loop${RESET} ${DIM}(reviewing last $ITERS_SINCE_VALIDATION iterations)${RESET}"
    NEXT_REQ_HINT="VALIDATION"
  else
    echo -e "${BOLD}━━ Iteration ${ITER_LABEL} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    if [ -n "$NEXT_REQ_HINT" ]; then
      echo -e "  ${CYAN}Next: ${NEXT_REQ_HINT#'### '}${RESET}"
    fi
  fi
  echo -e "${DIM}  REQs: $(count_open_reqs) open │ $(count_done_reqs)/$(count_total_reqs) done${RESET}"

  ITER_START=$(date +%s)
  ITER_LOG_FILE="$LOG_DIR/iter-$(printf '%03d' $ITERATION).jsonl"
  echo "0" > "$COST_FILE"
  echo "0" > "$TOOLS_FILE"
  echo "" > "$STATUS_FILE"
  echo "124" > "$EXIT_FILE"  # Pessimistic default (timeout)

  kill_dev_servers

  [ -f "$STATUS_JSON" ] && cp "$STATUS_JSON" "${STATUS_JSON}.bak"

  recover_status_json

  # Build prompt based on iteration type
  if [ "$IS_VALIDATION" -eq 1 ]; then
    AGENT_PROMPT=$(build_validator_prompt)
    ITER_MODEL="$VALIDATOR_MODEL"
    ITER_TIMEOUT_ACTUAL="$VALIDATOR_TIMEOUT"
    ITER_MAX_TURNS=60
  else
    AGENT_PROMPT=$(build_agent_prompt)
    ITER_MODEL="$MODEL"
    ITER_TIMEOUT_ACTUAL="$ITER_TIMEOUT"
    ITER_MAX_TURNS=100

    FULL_VERIFY=0
    if [ "$FULL_VERIFY_OVERRIDE" = "1" ] || [ $((ITERATION % 3)) -eq 0 ]; then
      FULL_VERIFY=1
      echo -e "  ${MAGENTA}Full verification enabled (iteration $ITERATION)${RESET}"
    fi
  fi

  # Run Claude agent
  set +eo pipefail
  (
    FULL_VERIFY=${FULL_VERIFY:-0} SANDBOX_MODE=$SANDBOX_MODE timeout --foreground --signal=TERM --kill-after=30 "$ITER_TIMEOUT_ACTUAL" \
      claude -p \
        --dangerously-skip-permissions \
        --output-format=stream-json \
        --model "$ITER_MODEL" \
        --max-turns "$ITER_MAX_TURNS" \
        --verbose \
        <<< "$AGENT_PROMPT"
    echo $? > "$EXIT_FILE"
  ) | tee "$ITER_LOG_FILE" | parse_progress
  set -eo pipefail

  EXIT_CODE=$(cat "$EXIT_FILE" 2>/dev/null || echo "1")

  kill_dev_servers

  ITER_COST=$(cat "$COST_FILE" 2>/dev/null || echo "0")
  ITER_TOOLS=$(cat "$TOOLS_FILE" 2>/dev/null || echo "0")
  TOTAL_COST=$(LC_NUMERIC=C awk "BEGIN{printf \"%.6f\", ${TOTAL_COST} + ${ITER_COST}}")

  ITER_END=$(date +%s)
  ITER_DURATION=$((ITER_END - ITER_START))

  if [ "$EXIT_CODE" -eq 124 ]; then
    echo -e "  ${RED}${BOLD}Iteration timed out after $(format_duration "$ITER_TIMEOUT")${RESET}"
  elif [ "$EXIT_CODE" -ne 0 ]; then
    echo -e "  ${RED}Claude exited with code $EXIT_CODE${RESET}"
  fi

  # Check for blocked REQs in status.json after iteration
  BLOCKED_COUNT=$(jq '[.[] | select(.status == "blocked")] | length' "$STATUS_JSON" 2>/dev/null || echo "0")
  if [ "$BLOCKED_COUNT" -gt 0 ]; then
    echo ""
    echo -e "  ${RED}${BOLD}┌──────────────────────────────────────────────────┐${RESET}"
    echo -e "  ${RED}${BOLD}│  ⚠  $BLOCKED_COUNT BLOCKED REQUIREMENT(S)                       │${RESET}"
    echo -e "  ${RED}${BOLD}└──────────────────────────────────────────────────┘${RESET}"
    jq -r 'to_entries[] | select(.value.status == "blocked") | .key' "$STATUS_JSON" 2>/dev/null | while read -r req_id; do
      local_title=$(grep "^### ${req_id}:" "$PRD_FILE" 2>/dev/null | head -1 | sed 's/^### //')
      echo -e "  ${RED}  → ${local_title:-$req_id}${RESET}"
    done
    echo ""
  fi

  # Early termination: low-activity detection
  if [ "${ITER_TOOLS:-0}" -le 5 ] && [ "$EXIT_CODE" -eq 0 ]; then
    if grep -q 'status:.*blocked' "$STATUS_FILE" 2>/dev/null; then
      echo -e "  ${DIM}Iteration produced blocked status — not counting as low activity${RESET}"
      LOW_ACTIVITY_COUNT=0
    else
      LOW_ACTIVITY_COUNT=$((LOW_ACTIVITY_COUNT + 1))
      if [ "$LOW_ACTIVITY_COUNT" -ge 2 ]; then
        echo -e "  ${YELLOW}Two consecutive low-activity iterations (≤5 tools, not blocked). Stopping early.${RESET}"
        break
      fi
    fi
  else
    LOW_ACTIVITY_COUNT=0
  fi

  tag_iteration "$ITERATION"

  # ── Validation interval management ──────────────────────────
  if [ "$IS_VALIDATION" -eq 1 ]; then
    NEXT_INTERVAL=$(grep -Eo 'next_validation_interval:[[:space:]]*[0-9]+' "$STATUS_FILE" 2>/dev/null | grep -Eo '[0-9]+$' || echo "5")
    VALIDATE_INTERVAL="$NEXT_INTERVAL"
    ITERS_SINCE_VALIDATION=0
    echo -e "  ${MAGENTA}Next validation in $VALIDATE_INTERVAL iterations${RESET}"
  fi

  iter_dur_fmt=$(format_duration "$ITER_DURATION")
  iter_cost_fmt=$(LC_NUMERIC=C awk "BEGIN{printf \"%.4f\", ${ITER_COST}}")
  total_fmt=$(LC_NUMERIC=C awk "BEGIN{printf \"%.4f\", ${TOTAL_COST}}")
  echo -e "  ${BOLD}⏱  ${iter_dur_fmt}${RESET}  │  iter: \$${iter_cost_fmt}  │  total: \$${total_fmt}"
  echo ""

  append_iteration_log "$ITERATION" "$ITER_DURATION" "$iter_cost_fmt" "${ITER_TOOLS:-0}" "$EXIT_CODE"

  # Repeat detection: same REQ 3 consecutive times → auto-blocked
  if [ "$IS_VALIDATION" -eq 0 ] && [ -f "$ITER_LOG" ] && [ -n "$NEXT_REQ_HINT" ]; then
    REPEAT_REQ=$(echo "$NEXT_REQ_HINT" | grep -Eo 'REQ-[0-9]+[a-z]?' | head -1 || true)
    if [ -n "$REPEAT_REQ" ]; then
      REPEAT_COUNT=$(tail -3 "$ITER_LOG" | grep -c "\"req_hint\":.*$REPEAT_REQ" 2>/dev/null || echo "0")
      if [ "$REPEAT_COUNT" -ge 3 ]; then
        echo -e "  ${RED}${BOLD}REQ $REPEAT_REQ attempted 3 times in a row — auto-blocking${RESET}"
        jq --arg req "$REPEAT_REQ" \
          '.[$req].status = "blocked" | .[$req].notes = "Auto-blocked: 3 consecutive failed attempts"' \
          "$STATUS_JSON" > "${STATUS_JSON}.tmp" && mv "${STATUS_JSON}.tmp" "$STATUS_JSON"
      fi
    fi
  fi

  if [ "$EXIT_CODE" -ne 0 ]; then
    echo -e "  ${YELLOW}Waiting 10s before next iteration...${RESET}"
    sleep 10
  fi
done

print_summary
return_to_original_branch
kill_dev_servers
rm -f "$COST_FILE" "$TOOLS_FILE" "$STATUS_FILE" "$EXIT_FILE" "$LOCKFILE"
