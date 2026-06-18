# RA ONE SMC Discord Dashboard

This repository hosts the RA ONE SMC Discord dashboard for posted signal orders across XAUUSD, XAGUSD, USOIL, and UKOIL.

## Dashboard

The dashboard lives in `docs/` and is designed for GitHub Pages.

It shows:

- all Discord-posted signal orders from the journal snapshot
- symbol-level engine heartbeat and handling state
- SMC/ICT strategy confluence and vote pressure
- entry, stop-loss, TP1-TP4, confidence, and lifecycle status
- filters for symbol, direction, and status
- CSV export from the browser

## Update the data snapshot

Run this from the project root after journals or logs change:

```powershell
python .\tools\build_dashboard_data.py
```

That writes:

```text
docs/data/dashboard-data.json
```

## Preview locally

```powershell
python -m http.server 8080 -d docs
```

Then open:

```text
http://localhost:8080
```

## GitHub Pages

The workflow in `.github/workflows/pages.yml` deploys `docs/` using GitHub Actions. In repository settings, set Pages source to GitHub Actions.
