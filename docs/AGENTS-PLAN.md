# AEGIS agents — The Local Agent Console (design + plan)

> Status: **P0–P3 shipped**. Local-first agent inspection AND evaluation, live in the terminal.

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
aegis traces [evalon-db]      # browser evalon runs (traces/spans/metrics)
aegis eval init|run|list|compare|export|datasets   # evaluation harness
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

## P1 — Agent intelligence layer (shipped)

- [x] Agent-stack registry + classification
- [x] Ollama probe — loaded models from `http://localhost:11434/api/tags` when running
- [x] Docker containers-as-agents (`docker ps` merged into the inventory, absent → noted)
- [x] Per-agent **live CPU %** (delta of total CPU between polls) + memory bars
- [x] **Tree view** (`t`): parent → children preorder, pstree-style
- [x] Anomaly rules: `★` new-since-last-scan, `cpu ~N%`, `N children`, plus the
      secret/credential argument flags

## P2 — Evalon integration (shipped)

Our Node ≥ 24 ships `node:sqlite` — `aegis traces [db]` reads **Evalon's**
`~/.evalon/evalon-runs.sqlite` (or any path) directly, no Python required:

- projects → traces → per-span view (kind, latency, error), metrics (cost, tokens),
  expected-vs-actual, events; `--json`/`--once`/`--errors`/`--project` flags
- schema sourced from the evalon repo (traces/spans/events/metrics/sessions) —

**Why this is the right move:** Evalon solved the hard Python instrumentation problem.
We don't re-solve it; we render it in the terminal everyone already uses.

## P3 — `aegis eval` (shipped, mirrors evalon)

- Deterministic checks: `exact` / `contains` / `regex` (with `(?i)` shim + `negate`)
- Rubric checks: aggregates per-criterion scores (1–5) provided by your judge per record
- Versioned runs in SQLite (`~/.aegis/eval.db`): `init · run <file.jsonl> --app <name>
  --config eval.config.json · list · compare <app> [--v1/--v2] · export · datasets`
- `datasets` reads an evalon evals db (datasets/versions/cases/runs) read-only
- Any agent can feed runs as JSONL — no source edits required

## Principles (why this is "real", not a toy)

1. **Runs in one second with zero setup** — no installs, no keys, no server.
2. **Reads real system state** — every number comes from an OS call; nothing is synthesized.
3. **Honest classification** — heuristics are labeled as heuristics; no fake "AI-powered" claims.
4. **Same terminal for watch → inspect → kill → eval → report** — one muscle memory.
5. **Evalon-compatible** — if users already ship evalon traces, we show them; we don't lock tooling.