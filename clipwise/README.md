# ClipWise AI

AI video intelligence for event videographers and studios. Upload raw event
footage, and ClipWise detects the highlights with TwelveLabs, indexes the people
in it, cuts a ready-to-share reel with ffmpeg, and publishes a public client
portal where the couple (or the coach, or the client) can search for themselves
by name.

The marketing site, studio app, and client portal are a faithful rebuild of the
ClipWise design, wired to a real FastAPI + MongoDB backend.

---

## What's in the box

| Area | Status |
|---|---|
| JWT auth (register / login / me / logout), admin + client roles, seeded demo account | ✅ |
| 5-step event wizard: chunked upload → details → highlight preferences → AI processing → finish | ✅ |
| HTML5 player with highlight markers, HTTP range streaming, `YOUR FOOTAGE` badge, demo fallback | ✅ |
| TwelveLabs Pegasus highlight detection + Marengo semantic search, real timestamps and scores in Mongo | ✅ |
| Highlight reel generator (ffmpeg cut + concat, faststart MP4, 9:16 vertical toggle, progress, download) | ✅ |
| Browser-side face recognition: name a face in a frame, scan the video, tagged on the timeline | ✅ |
| Public client portal with "find me" search and per-clip downloads, no login | ✅ |
| Event reports as JSON, CSV, and PDF | ✅ |
| Stripe subscriptions, one-off event credits, webhooks, customer portal | ✅ |
| Admin dashboard: every event, status, usage, storage, clients | ✅ |
| Transactional email (Resend or SendGrid): welcome, event ready, portal invite | ✅ |
| S3 / Cloudinary object storage (local disk only for development) | ✅ |
| Celery + Redis background jobs with SSE progress to the browser | ✅ |
| Social clip generator (TikTok 15s · Reels 30s · Shorts 60s, 9:16 and 16:9) | ✅ |

**No silent mock fallbacks.** If TwelveLabs, Stripe, storage, or email is not
configured — or an upstream call fails — the API returns the real error and the
UI shows it. The only sample data in the system is the explicitly-labelled demo
event created by the seeder.

---

## Stack

- **Frontend** — React 18, React Router, Tailwind, CRA + CRACO (`@/` alias), lucide-react, `@vladmandic/face-api`
- **Backend** — FastAPI, Motor/PyMongo, Pydantic v2, Celery, python-jose, passlib
- **Database** — MongoDB
- **AI** — TwelveLabs (`pegasus1.5` for highlights, `marengo2.7` for search)
- **Video** — ffmpeg / ffprobe
- **Payments** — Stripe
- **Storage** — S3 (or any S3-compatible store) / Cloudinary
- **Email** — Resend or SendGrid

---

## Quick start (Docker)

```bash
cp backend/.env.example backend/.env
# fill in TWELVELABS_API_KEY, STRIPE_SECRET_KEY, S3_* … as you get them
docker compose up --build
```

- App: http://localhost:3000
- API docs: http://localhost:8000/api/docs

## Quick start (local)

```bash
# --- backend ---
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# --- worker (separate shell) ---
celery -A celery_worker.celery_app worker --loglevel=info
# …or set RUN_JOBS_INLINE=true in .env to skip Redis during development

# --- frontend (separate shell) ---
cd frontend
npm install
cp .env.example .env      # REACT_APP_BACKEND_URL=http://localhost:8000
npm start
```

You need `ffmpeg` and `ffprobe` on PATH, a MongoDB at `MONGO_URL`, and (unless
`RUN_JOBS_INLINE=true`) a Redis at `REDIS_URL`.

### Demo credentials

```
demo@clipwise.ai / ClipWise2026!
```

Seeded on first boot as an admin on the Agency plan, with one sample wedding
event: 13 highlights, 4 indexed people, 3 shoppable products. The landing page's
live demo reads from the same event through `/api/public/demo`.

---

## Configuration

Every credential is read from the environment — see `backend/.env.example` for
the annotated list. The ones that matter most:

| Variable | Why |
|---|---|
| `TWELVELABS_API_KEY` | Highlight detection and semantic search. Without it, `POST /events/{id}/process` returns 503 with an explanatory message. |
| `STORAGE_BACKEND` | `s3` or `cloudinary` in production. `local` writes to the container disk and warns loudly at startup. |
| `REDIS_URL` | Celery broker. Set `RUN_JOBS_INLINE=true` to run jobs in a thread instead (development only). |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Checkout, subscription state, and the self-serve customer portal. |
| `EMAIL_PROVIDER` + `RESEND_API_KEY` / `SENDGRID_API_KEY` | Welcome, "your event is ready", and portal invite emails. |
| `SECRET_KEY` | JWT signing. Change it. |

`Settings → API integration status` in the app reads
`GET /api/settings/integrations` and shows exactly which of these are live.

### Stripe webhook

```bash
stripe listen --forward-to localhost:8000/api/billing/webhook
```

Handles `checkout.session.completed`, `customer.subscription.created|updated|deleted`.

### Face recognition models

Detection and descriptor extraction run entirely in the browser; only the
128-float descriptor is stored, scoped to one event. Weights load from jsDelivr
by default. To self-host:

```bash
cp -r frontend/node_modules/@vladmandic/face-api/model frontend/public/models
# then set REACT_APP_FACE_MODEL_URL=/models
```

If you serve video from S3 or Cloudinary, add a CORS rule allowing your app
origin — the player sets `crossOrigin="anonymous"` so face detection can read
frames off the canvas.

---

## How the pipeline works

```
upload (8 MB chunks)  →  merge  →  object storage (raw)
        ↓  Celery: clipwise.process_event
   ffprobe  →  ffmpeg transcode to H.264/AAC MP4 (+faststart)  →  thumbnail
        ↓
   store master  →  TwelveLabs asset upload (correct video/mp4 content type)
        ↓
   Marengo index (semantic search)  →  Pegasus analyze (structured JSON highlights)
        ↓
   highlights written to Mongo  →  event marked ready  →  "event ready" email
```

Progress is written to Mongo at every stage, and
`GET /api/events/{id}/progress` streams it to the browser over SSE (with a
polling fallback if the stream drops). The reel generator does the same over
`GET /api/events/{id}/reel/progress`.

Nothing long-running happens inside a request handler.

---

## API surface

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` · `/login` · `/logout`, `GET /api/auth/me` | JWT, also set as an httpOnly cookie |
| `GET/POST` | `/api/events` | list / create |
| `GET/PATCH/DELETE` | `/api/events/{id}` | |
| `POST` | `/api/events/{id}/upload/init` · `/upload/chunk` · `/upload/complete` | chunked, 500 MB cap |
| `POST` | `/api/events/{id}/process` | queues the pipeline |
| `GET` | `/api/events/{id}/status` · `/progress` | poll / SSE |
| `GET` | `/api/events/{id}/stream` · `/thumbnail` | HTTP range; redirects to a presigned URL on S3/Cloudinary |
| `GET` | `/api/events/{id}/highlights` · `/search?q=` | Pegasus results · Marengo search |
| `GET/POST` | `/api/events/{id}/reel` · `/reel/progress` · `/reel/download` | vertical toggle, `{title}_highlights.mp4` |
| `GET/POST` | `/api/events/{id}/clips` | TikTok / Reels / Shorts |
| `GET/POST/DELETE` | `/api/events/{id}/people` · `/people/{pid}/descriptors` · `/appearances` | face index |
| `GET` | `/api/events/{id}/report` · `report.csv` · `report.pdf` | |
| `POST` | `/api/events/{id}/portal/invite` | emails the client |
| `GET` | `/api/portal/{id}` · `/find_me` · `/stream` · `/highlights/{hid}/download` | public, no auth |
| `GET` | `/api/public/demo` · `/demo/find_me` | landing-page live demo |
| `POST` | `/api/billing/checkout` · `/portal` · `/webhook`, `GET /billing/status/{sid}` · `/usage` | |
| `GET` | `/api/admin/overview` · `/api/stats/overview` · `/api/settings/integrations` | |

Endpoints reached by `<video src>`, `<img src>` and `<a href>` also accept
`?token=<jwt>`, since those elements cannot send an `Authorization` header.

---

## Plans

Matching the marketing site:

| Plan | Price | Events / month | Named people per event |
|---|---|---|---|
| Starter | $79/mo | 5 | 10 |
| Pro | $199/mo | 20 | 50 |
| Agency | $499/mo | unlimited | unlimited |
| Pay per event | $49 one-time | +1 credit | 10 |

Limits are enforced server-side in `POST /api/events` and
`POST /api/events/{id}/people`.

---

## Tests

```bash
cd backend
pip install pytest mongomock_motor
pytest -q
```

21 tests covering auth, the chunked upload path, the face index, reports
(CSV + PDF), the portal, admin, plus the real ffmpeg pipeline end to end
(transcode → faststart check → cut → concat → 1080×1920 vertical export) and the
failure paths that must surface an error instead of substituting mock data.

---

## Notes and trade-offs

- The frontend is JavaScript + JSX rather than TypeScript, matching the existing
  ClipWise codebase this was rebuilt from. `jsconfig.json` provides the `@/`
  alias and editor support.
- Face recognition runs client-side, so a "scan the video" pass costs one frame
  decode every few seconds in the browser rather than GPU time on the server.
  On a long event, scan the segments you care about.
- Shoppable-video brand detection is modelled (schema, approval flow, portal
  surface) but the detector itself is not wired to a vision API; products are
  populated for the demo event only.
- `STORAGE_BACKEND=local` exists for development convenience and logs a warning
  at startup. Containers have ephemeral disks — use S3 or Cloudinary in
  production.
