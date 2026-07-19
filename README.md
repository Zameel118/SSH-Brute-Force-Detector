# SSH Brute Force Detector

Portfolio cybersecurity project that monitors SSH authentication logs, detects brute-force login attacks, and responds with an escalating defense:

**alert → rate-limit → block → auto-unblock**

Includes a **Signal Ops Console** React dashboard (live feed, charts, GeoIP map, Case Files, session replay) plus a FastAPI backend with WebSocket streaming.

---

## Features

### Detection & response
- **Simulation Mode (default)** — generates realistic fake `auth.log` lines; blocks are simulated (no firewall changes). Zero external setup.
- **Live Mode (optional)** — watch a real auth log and run `ufw`. Hardcoded safety: never blocks `127.0.0.1`, `::1`, `localhost`, or the configured admin IP.
- Sliding-window detection with configurable thresholds (**persisted to SQLite** so restarts don’t forget in-progress attacks)
- Escalating response + auto-unblock after N hours
- Whitelist / blacklist CRUD with IP format validation

### Dashboard (Signal Ops Console)
- Live attack feed with WebSocket updates
- Attacks-over-time chart + containment mix + Top Attacking IPs table
- GeoIP labels and world map (demo IPs work offline)
- Dark / light theme, optional alert sound, guided tour
- **Reset Demo**, sample attack **replay**
- CSV / printable HTML report / fail2ban config export

### Case Files & session replay
- **Case File snapshots** — freeze one attacker’s timeline (IP, geo, escalation steps, block window, full event list) into a shareable read-only page at `/case/{public_id}`
- **Session-replay scrubber** — play / pause / scrub through stored events to show alert → rate-limit → block escalation
- Case reads are public even when API-key auth is enabled (create still requires a key if configured)

### Ops / portfolio extras
- Optional **API key** auth (`API_KEY` / `X-API-Key`)
- Write-API **rate limiting** (token bucket per client)
- Prometheus-style **`GET /metrics`**
- Docker Compose one-command demo

---

## Quick start (Docker)

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
cd "SSH Brute Force Detector"
docker compose up --build
```

Then open:

| URL | What |
|-----|------|
| http://localhost:3000 | Dashboard (Signal Ops Console) |
| http://localhost:8000/docs | FastAPI interactive docs |
| http://localhost:8000/api/health | Health check (JSON) |
| http://localhost:8000/metrics | Prometheus metrics |

### Try the demo

1. Open http://localhost:3000
2. Click **Simulate**
3. Watch the live feed escalate: failed attempts → alert → rate-limit → block
4. In **Top Attacking IPs** or **Blocked**, use:
   - **Play** — open the session-replay scrubber
   - **Folder** — create a shareable Case File, then **Copy link** / **Open**
5. Case File URL shape: `http://localhost:3000/case/<public_id>`  
   (use a real id from the UI — not the literal string `{id}`)

Stop with `Ctrl+C`, or:

```bash
docker compose down
```

SQLite DB and simulated logs live in the Docker volume `detector-data` and survive restarts.

---

## Simulation Mode (default)

No real SSH or firewall needed. The backend:

1. Writes fake auth.log lines to `/app/data/simulated_auth.log`
2. Tails that file continuously
3. Detects brute-force patterns
4. Logs simulated block / rate-limit actions (does **not** run `ufw`)

```bash
curl -X POST http://localhost:8000/api/simulate/attack \
  -H "Content-Type: application/json" \
  -d "{\"attacker_ip\":\"203.0.113.50\",\"num_attempts\":20}"
```

### Case File via API

```bash
# After some events exist for that IP:
curl -X POST http://localhost:8000/api/cases \
  -H "Content-Type: application/json" \
  -d "{\"source_ip\":\"203.0.113.50\"}"

# Response includes share_path like /case/8JpjJIa1aZjG
# Open: http://localhost:3000/case/<public_id>
```

---

## Live Mode (optional, real server)

Only use on a Linux host you control, with SSH logs and `ufw` available.

1. Example Docker override ideas:

```yaml
environment:
  MODE: live
  LIVE_LOG_PATH: /var/log/auth.log
  ADMIN_IP: "YOUR.PUBLIC.IP.HERE"
volumes:
  - /var/log/auth.log:/var/log/auth.log:ro
```

Live `ufw` typically needs host networking / privileges — prefer running the backend natively on the server for real firewall control.

2. Native backend:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: MODE=live, LIVE_LOG_PATH=/var/log/auth.log, ADMIN_IP=...
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Safety checks always apply:** localhost and `ADMIN_IP` are never blocked.

---

## Local development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
copy .env.example .env          # Windows
# cp .env.example .env          # macOS / Linux
uvicorn app.main:app --reload --port 8000
```

Open http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (Vite proxies `/api` and `/ws` to the backend).

---

## Default thresholds

| Stage | Failed attempts (within 10 min) | Action |
|-------|----------------------------------|--------|
| Alert | 5 | Log + optional email |
| Rate-limit | 10 | Simulated / `ufw limit` |
| Block | 15 | Simulated / `ufw deny` |
| Auto-unblock | after 24 hours | Remove block |

Override via env: `ALERT_THRESHOLD`, `RATE_LIMIT_THRESHOLD`, `BLOCK_THRESHOLD`, `TIME_WINDOW_MINUTES`, `UNBLOCK_AFTER_HOURS`.

See `backend/.env.example` for the full list (API key, rate limits, SMTP, CORS).

---

## Architecture

```
auth.log (simulated or live)
        │
        ▼
   LogTailer ──► Parser ──► DetectionEngine (sliding window)
                                    │
                                    ▼
                            EscalationService
                         alert → rate-limit → block
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
               SQLite DB      FirewallMgr      WebSocket
              (events,          (sim/ufw)      → React UI
               blocks, cases)
```

| Layer | Stack |
|-------|--------|
| Backend | FastAPI, SQLAlchemy, SQLite, Uvicorn |
| Frontend | React 18, Vite, Tailwind, Recharts, Leaflet, Lucide |
| Deploy | Docker Compose (nginx frontend → backend) |

---

## Project structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan (tailer, auto-unblock)
│   │   ├── parser.py            # auth.log regex parser
│   │   ├── simulator.py         # fake log generator
│   │   ├── tailer.py            # tail -f with offset persistence
│   │   ├── detection.py         # sliding-window detector
│   │   ├── escalation.py        # alert → rate-limit → block
│   │   ├── firewall.py          # simulated or real ufw
│   │   ├── case_builder.py      # Case File / timeline snapshots
│   │   ├── geo.py               # GeoIP (demo + cache + fallback)
│   │   ├── auth.py              # optional API-key middleware
│   │   ├── rate_limit.py        # write-API token bucket
│   │   ├── routers/             # REST endpoints
│   │   └── ...
│   ├── samples/                 # Replayable sample attack logs
│   ├── Dockerfile
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Live console
│   │   ├── components/
│   │   │   ├── EventFeed.jsx
│   │   │   ├── StatsCharts.jsx
│   │   │   ├── AttackMap.jsx    # lazy-loaded
│   │   │   ├── CaseFilePage.jsx
│   │   │   ├── SessionReplayScrubber.jsx
│   │   │   └── ...
│   │   └── ...
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
└── README.md
```

---

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/events` | Recent events |
| GET | `/api/events/stats` | Chart / Top IP stats |
| GET | `/api/blocked` | Active blocks |
| POST | `/api/blocked/{ip}/unblock` | Manual unblock |
| GET/POST/DELETE | `/api/whitelist` · `/api/whitelist/{ip}` | Whitelist CRUD |
| GET/POST/DELETE | `/api/blacklist` · `/api/blacklist/{ip}` | Blacklist CRUD |
| GET | `/api/config` | Detection config |
| PUT | `/api/config/mode` | `simulation` / `live` |
| POST | `/api/simulate/attack` | Trigger demo attack |
| POST | `/api/demo/reset` | Reset demo state |
| GET | `/api/samples` | List sample logs |
| POST | `/api/samples/replay` | Replay a sample |
| GET | `/api/geo/attackers` | Geo-enriched attackers |
| GET | `/api/geo/ip/{ip}` | Geo for one IP |
| GET | `/api/export/events.csv` | CSV export |
| GET | `/api/export/report.html` | Printable report |
| GET | `/api/export/fail2ban` | fail2ban-style config |
| POST | `/api/cases` | Create Case File snapshot |
| GET | `/api/cases/{public_id}` | Read Case File (**public**) |
| GET | `/api/timeline/{ip}` | Live timeline for scrubber |
| GET | `/metrics` | Prometheus metrics |
| WS | `/ws` | Live event stream |

Interactive docs: http://localhost:8000/docs

---

## Security concepts demonstrated

- **Log analysis** — parsing syslog-style SSH authentication events
- **Threat pattern recognition** — sliding time windows to distinguish typos from brute force
- **Automated response** — escalating mitigation instead of a single harsh action
- **Allow/deny lists** — reducing false positives for trusted networks
- **Shareable incident artifacts** — frozen Case Files for demos / portfolio links
- **Defense in depth** — this tooling complements (does not replace) key-based SSH, fail2ban, VPN, and disabling password auth

---

## License

See [LICENSE](LICENSE).
