# Developer scripts

Quick utilities used during development. **Not** part of the runtime — they
talk to a running daemon via the REST API for debugging and visual audits.

## Requirements

```bash
pip install playwright
python -m playwright install chromium
```

## Scripts

| Script | What it does |
|---|---|
| `snapshot-viewports.py` | Renders the dashboard at 4 viewport widths (400 / 414 / 768 / 1280) × 3 states (base / settings open / history expanded). Writes PNGs to `/tmp/cch-shots/`. |
| `snapshot-header-states.py` | Renders the header region across `{zh,en} × {off,on}` at 6 viewport widths to catch toggle / locale-switcher layout regressions. |
| `inspect-toggle-geometry.py` | Measures DOM bounding boxes of the master toggle's button, pill, knob, and label in OFF vs ON state. Useful for diagnosing the kind of overflow bug we hit during initial polish. |

Run each as `python scripts/dev/<name>.py` while the daemon is up at
`127.0.0.1:8765`. Output paths print to stdout.

These scripts mutate the daemon's state (add/remove schedule points,
toggle enable). Don't run them against a production instance.
