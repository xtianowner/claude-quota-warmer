# Verification

How to convince yourself (or anyone) that the dashboard's "Success"
badge reflects a **real** Claude Code request — not a hardcoded
green pixel.

Run these as a sanity check after install, or any time you want to
audit the system end-to-end.

## TL;DR

Change the *expected marker* to something nonsensical and click
**Trigger now**. The dashboard should flip to **Failed** with an error
that names your bogus marker. If it still says **Success**, *that*
would be fake — but the test confirms it isn't.

## Layered evidence

Four independent layers, each ruling out a different class of
"fake data" hypothesis.

### Layer 1 — source code

The only place that constructs a `RunRecord` is `backend/runner.py`.
Read it. There are zero hardcoded success paths; `success` is
computed from real `exit_code` and real `output`:

```python
success = exit_code == 0 and (cfg.expected_marker in output)
```

If you tampered with this file, the rest of the verifications below
would still catch you.

### Layer 2 — daemon log

Tail the daemon's stdout while you click **Trigger now**:

```bash
tail -f data/logs/daemon.out.log
```

You should see exactly one log line of the form:

```
[time] INFO healthcheck.runner | running healthcheck: /Users/you/.local/bin/reclaude -p Claude Code healthcheck: 请只回复 HEALTHCHECK_OK
```

The path printed is the result of `shutil.which(cfg.command)` — the
exact binary the daemon is about to exec. If the dashboard ever
shows a "Success" badge *without* a matching log line, the UI is
lying. (It doesn't.)

### Layer 3 — the runs log on disk

Every run lands in `data/runs.jsonl`. The `output_tail` field is the
last ~2KB of the subprocess's combined stdout+stderr — verbatim. For
a normal `reclaude` invocation it looks like:

```jsonl
{"id": "2026-05-13T02:46:04+00:00", "status": "success",
 "attempts": [{"exit_code": 0, "duration_ms": 7122,
   "output_tail": "同步配置…\nHEALTHCHECK_OK\n", "success": true, ...}]}
```

That `"同步配置…"` is `reclaude`'s own progress print before it execs
`claude`. It's idiosyncratic; you can't fake it without actually
running `reclaude`.

### Layer 4 — operating system process table

The daemon spawns a real child process. Catch it in the act:

```bash
# 1. find the daemon's python pid (not the shell wrapper)
DPID=$(ps -eo pid,command \
       | awk '$2 ~ /python$/ && $3=="-m" && $4=="backend.main" {print $1; exit}')

# 2. in another shell, poll for daemon children
while sleep 0.3; do
  pgrep -P $DPID | xargs -I{} ps -p {} -o pid,etime,command 2>/dev/null
done
```

Now click **Trigger now** in the UI. Within a second the poll shows
something like:

```
81329     00:00 /Users/you/.local/bin/claude -p Claude Code healthcheck: 请只回复 HEALTHCHECK_OK
81329     00:01 /Users/you/.local/bin/claude -p ...
...
81329     00:08 /Users/you/.local/bin/claude -p ...
```

You're seeing the kernel's authoritative process table. A subprocess
exists with the expected command line and lives for the duration of
the API call. No UI can fake this.

> Note: `reclaude` is a wrapper. It immediately `exec`s `claude`,
> so the child you see is `claude`, not `reclaude`. If you set
> `command=claude` directly in config, the child line will say
> `claude` from the start.

## Adversarial experiments

Two changes that should each immediately flip a successful run to
failure. If both behave as documented, the success path is real.

### Experiment A — wrong marker

1. Edit **Expected marker** in the *Advanced config* card. Set it to
   `ZZZ_NEVER_GONNA_APPEAR_ZZZ`. Save.
2. Click **Trigger now**.

Expected outcome:
- Duration is *still* ~5–10s (the daemon really called `reclaude`).
- Exit code is `0` (the subprocess succeeded).
- `output_tail` still contains `HEALTHCHECK_OK` (real model reply).
- Final status: **Failed** with error
  `expected marker 'ZZZ_NEVER_GONNA_APPEAR_ZZZ' not in output`.

This proves the success/fail decision is computed from real output,
not faked.

Restore the marker to `HEALTHCHECK_OK` afterwards.

### Experiment B — non-existent command

1. Edit **Command** to `reclaude_does_not_exist_xyz`. Save.
2. Click **Trigger now**.

Expected outcome:
- Duration is **~1ms** (no subprocess was spawned).
- Exit code `127` (POSIX standard for "command not found").
- `output_tail` is empty.
- Status: **Failed** with error `command not found in PATH: ...`.

This proves the daemon actually consults `PATH` and resolves the
binary — it doesn't just rubber-stamp anything you put in the field.

Restore the command to `reclaude` (or `claude`) afterwards.

### Sanity — duration jitter

Trigger a few real successful runs back to back. The `duration_ms`
should vary across calls (we've seen 6300 / 6800 / 7100 / 9300 /
10600 ms on the same machine). This is real network and API latency
talking to Anthropic. A mocked path would emit identical or rigidly
patterned durations.

## What this *doesn't* prove

These checks confirm the daemon is really calling `reclaude` and
really checking its output. They don't prove what the *Anthropic
side* does with the request — e.g. whether the call actually rolls
the 5-hour quota window. That's a property of Claude Code's billing
service. The healthcheck only proves the request went out and came
back successfully; whether that's enough to count as "window used"
is determined by Anthropic.
