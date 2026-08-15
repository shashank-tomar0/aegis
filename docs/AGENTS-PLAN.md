# AEGIS agents — The Local Agent Console (design + plan)

> Status: **P0 shipped**. P1 partial (agent detection + Ollama probe). P2–P3 designed, not built.

## Problem (why this exists)

AI agents now run silently on the machines people actually use — Claude, Cursor, codex,
ollama, Python agent scripts. Nobody can answer three questions in one glance:

1. **What is running right now, and is any of it an AI agent?** (htop can't tell an agent from a browser.)
2. **For a given agent: what is it, what is it executing, how is it behaving?** (command line, path, parent tree, CPU/memory trend, flagged activity.)
3. **Is it working or stuck / leaking secrets / doing something unexpected?** (anomaly + heuristic flags, later: eval scores.)

Existing tools cover halves: `htop`/Task Manager show processes without agent meaning;
[Evalon](https://github.com/sidmanale643/evalon) shows rich traces *only for Python agents
you instrument* — no device view, Python-only, requires source edits.

**AEGIS agents closes the gap: the device-wide live terminal console for agents**, with an
evalon-compatible evaluation layer.

## Product shape

```
aegis agents                  # interactive TUI (this repo)
aegis agents --json           # machine-readable snapshot for CI/scripts
aegis agents --once           # one-shot text table
aegis agents traces           # (P2) browse evalon traces from ~/.evalon/*.sqlite
aegis eval run '{"prompt":…}' # (P3) deterministic + rubric scoring, versioned datasets
```

## P0 — Live inventory (shipped)

- Reads the real OS (PowerShell CIM + Get-Process; ps/`/proc` on Linux later) — command
  line, executable path, parent PID, session, CPU seconds, working set, threads, handles,
  start time, per process.
- **Agent detection** (labeled heuristic, never claims certainty): recognized agent stacks
  (ollama, llama-server, claude, cursor, codex, aider, goose, gemini, uvicorn, …) +
  agent markers in the command line (langchain, mcp-server, openai, agent files, …).
- **Secret/anomaly flags**: API keys/tokens/passwords/.env or network tunneling in args.
- Keyboard-driven: `j/k/↑↓` select, `ENTER/d` detail pane (full command line, path, parent
  chain, resource stats), `1–5` sort (mem/cpu/pid/name/class), `f` filter, `r` refresh,
  `+/-` poll interval, `k` kill-with-confirm, `e` export JSON, `q` quit.
- Zero dependencies; works in any modern terminal; no server, no keys.

## P1 — Agent intelligence layer (partially shipped)

- [x] Agent-stack registry + classification (shipped)
- [x] Ollama probe — shows loaded models from `http://localhost:11434/api/tags` when running (shipped)
- [ ] Docker containers-as-agents (docker CLI, when present)
- [ ] Per-agent CPU/mem sparkline (sampled over time)
- [ ] Children/parent tree view + "spawned by" chains (pstree-style)
- [ ] Anomaly rules: sustained high CPU, many children, new binaries in temp dirs

## P2 — Evalon integration (designed)

Our Node ≥ 24 ships `node:sqlite` — we read **Evalon's** `~/.evalon/evalon-runs.sqlite`
directly, no Python required on this side:

- `aegis agents traces` → pick app → show trace tree, per-span LLM cost/latency/tokens,
  expected-vs-actual, errors; rerun evaluation for a project
- `aegis agents --evalon <db-path>` → device view + traces side by side
- Match by process: e.g. a Python agent process whose evalon traces exist → "open traces" in the detail pane

**Why this is the right move:** Evalon solved the hard Python instrumentation problem.
We don't re-solve it; we make it visible in the terminal everyone already uses, and we
mirror its API idioms in our Node eval layer.

## P3 — `aegis eval` (designed, mirrors evalon)

- Deterministic checks (exact/contains/regex vs `expected`) + rubric scores (1–5 criteria)
  for any output file/JSONL, stored versioned in SQLite
- `aegis eval run <file|jsonl> --schema ...` → scores + failures; `aegis eval compare <a> <b>`
- JSONL ingestion so any agent (Python/Node/CLI) can feed runs without source edits
  (`aegis eval ingest --app my-app`)

## Principles (why this is "real", not a toy)

1. **Runs in one second with zero setup** — no installs, no keys, no server.
2. **Reads real system state** — every number comes from an OS call; nothing is synthesized.
3. **Honest classification** — heuristics are labeled as heuristics; no fake "AI-powered" claims.
4. **Same terminal for watch → inspect → kill → eval → report** — one muscle memory.
5. **Evalon-compatible** — if users already ship evalon traces, we show them; we don't lock tooling.