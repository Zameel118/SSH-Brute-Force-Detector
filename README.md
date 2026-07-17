# SSH Brute Force Detector

A portfolio cybersecurity project that monitors SSH authentication logs, detects brute-force login attacks, and responds with an escalating defense: **alert → rate-limit → block → auto-unblock**.

Includes a React dashboard for live attack feeds, charts, and whitelist/blacklist management.

## Features

- **Simulation Mode (default)** — generates realistic fake `/var/log/auth.log` lines; blocks are simulated (no firewall changes). Works with zero external setup.
- **Live Mode (optional)** — can watch a real auth log and run `ufw` commands. Hardcoded safety: never blocks `127.0.0.1`, `::1`, `localhost`, or the configured admin IP.
- Sliding-window detection with configurable thresholds
- Escalating response + auto-unblock after N hours
- Whitelist / blacklist CRUD
- REST API + WebSocket live updates
- Dark security-dashboard UI

## Quick start (Docker)

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

```bash
cd "SSH Brute Force Detector"
docker compose up --build
```

Then open:

| URL | What |
|-----|------|
| http://localhost:3000 | Dashboard |
| http://localhost:8000/docs | FastAPI interactive docs |
| http://localhost:8000/api/health | Health check |

### Try the demo

1. Open the dashboard at http://localhost:3000
2. Click **Simulate Attack**
3. Watch the live feed escalate: failed attempts → yellow alert → orange rate-limit → red block
4. Use **Unblock** on a blocked IP, or manage whitelist/blacklist in the panels below

Stop with `Ctrl+C`, or in another terminal:

```bash
docker compose down
```

SQLite DB and simulated logs are stored in the Docker volume `detector-data` so they survive restarts.

## Simulation Mode (default)

No real SSH or firewall needed. The backend:

1. Writes fake auth.log lines to `/app/data/simulated_auth.log`
2. Tails that file continuously
3. Detects brute-force patterns
4. Logs simulated block/rate-limit actions to the database (does **not** run `ufw`)

Trigger via UI button or API:

```bash
curl -X POST http://localhost:8000/api/simulate/attack \
  -H "Content-Type: application/json" \
  -d "{\"attacker_ip\":\"203.0.113.50\",\"num_attempts\":20}"
```

## Live Mode (optional, real server)

Only use on a Linux host you control, with SSH logs and `ufw` available.

1. Mount the real auth log and run the backend with `MODE=live` (example):

```yaml
# override in docker-compose or .env
environment:
  MODE: live
  LIVE_LOG_PATH: /var/log/auth.log
  ADMIN_IP: "YOUR.PUBLIC.IP.HERE"
volumes:
  - /var/log/auth.log:/var/log/auth.log:ro
  # Live ufw typically needs host networking / privileges — prefer running
  # the backend natively on the server for real firewall control.
```

2. Or run the backend natively on the server:

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

## Local development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env
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

## Default thresholds

| Stage | Failed attempts (within 10 min) | Action |
|-------|----------------------------------|--------|
| Alert | 5 | Log + optional email |
| Rate-limit | 10 | Simulated / `ufw limit` |
| Block | 15 | Simulated / `ufw deny` |
| Auto-unblock | after 24 hours | Remove block |

Override via environment variables: `ALERT_THRESHOLD`, `RATE_LIMIT_THRESHOLD`, `BLOCK_THRESHOLD`, `TIME_WINDOW_MINUTES`, `UNBLOCK_AFTER_HOURS`.

## Project structure

```
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + lifespan tasks
│   │   ├── parser.py        # auth.log regex parser
│   │   ├── simulator.py     # fake log generator
│   │   ├── tailer.py        # tail -f with offset persistence
│   │   ├── detection.py     # sliding-window detector
│   │   ├── escalation.py    # alert → rate-limit → block
│   │   ├── firewall.py      # simulated or real ufw
│   │   ├── routers/         # REST endpoints
│   │   └── ...
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/                 # React dashboard
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
└── Prompt.txt
```

## Security concepts demonstrated

- **Log analysis** — parsing syslog-style SSH authentication events
- **Threat pattern recognition** — sliding time windows to distinguish typos from brute force
- **Automated response** — escalating mitigation instead of a single harsh action
- **Allow/deny lists** — reducing false positives for trusted networks
- **Defense in depth** — detection tooling complements (does not replace) key-based SSH, fail2ban, VPN, and disabling password auth

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/events` | Recent events |
| GET | `/api/events/stats` | Chart stats |
| GET | `/api/blocked` | Active blocks |
| POST | `/api/blocked/{ip}/unblock` | Manual unblock |
| GET/POST/DELETE | `/api/whitelist` | Whitelist CRUD |
| GET/POST/DELETE | `/api/blacklist` | Blacklist CRUD |
| GET | `/api/config` | Detection config |
| PUT | `/api/config/mode` | `simulation` / `live` |
| POST | `/api/simulate/attack` | Trigger demo attack |
| WS | `/ws` | Live event stream |

## License

See [LICENSE](LICENSE).
