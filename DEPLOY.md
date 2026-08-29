# Deploying GeoWork Pro backend to Render (free tier)

Your `settings.py` was already environment-variable-driven, so the only
things added here are: `gunicorn`/`whitenoise` (production server + static
files), `dj-database-url` (so it accepts Render's single `DATABASE_URL`),
a `.gitignore` (so secrets and huge folders never get pushed), and a
`Procfile` (tells Render how to start the app).

## 1. Push this to GitHub

From this folder (`geowork_backend/`), in Terminal:

```bash
git init
git add .
git commit -m "Prepare for Render deployment"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/geowork-backend.git
git push -u origin main
```

Replace the `git remote add` URL with the one GitHub showed you when you
created the repo. If prompted for credentials, GitHub now requires a
Personal Access Token instead of your password — GitHub will show you a
link to create one the first time this happens; use that as the password.

**Double check `git status` before committing** — if you see `venv/`,
`node_modules/`, or `.env` listed as files about to be added, the
`.gitignore` isn't being picked up (make sure it's literally named
`.gitignore`, not `.gitignore.txt`) — stop and fix that before pushing.

## 2. Create the Render Postgres database first

On https://dashboard.render.com:
1. **New → PostgreSQL**
2. Name it (e.g. `geowork-db`), choose the **Free** plan for now
3. Once created, open it and find **"Connect"** → copy the **Internal
   Database URL** (starts with `postgres://`)
4. Open the database's **Shell** tab (in the Render dashboard) and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
   This is required — the geofencing feature won't work without it.

## 3. Create the web service

1. **New → Web Service** → connect your GitHub repo
2. **Runtime**: Python 3
3. **Build Command**: `pip install -r requirements.txt && python manage.py collectstatic --noinput`
4. **Start Command**: `gunicorn geowork_backend.wsgi --bind 0.0.0.0:$PORT`
5. **Plan**: Free (for this initial test)

## 4. Set environment variables

In the web service's **Environment** tab, add:

| Key | Value |
|---|---|
| `SECRET_KEY` | a new random string — don't reuse the dev one. Generate one with `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DEBUG` | `False` |
| `DATABASE_URL` | the Internal Database URL you copied in step 2 |
| `CORS_ALLOWED_ORIGINS` | your frontend's URL once deployed (e.g. `https://your-app.vercel.app`) — leave blank for now if the frontend isn't deployed yet |

You do **not** need to set `ALLOWED_HOSTS` — the settings.py change picks
up Render's own hostname automatically.

## 5. Deploy, then set up the database

Click **Create Web Service** — Render builds and deploys automatically.
Once it's live, open its **Shell** tab and run:

```bash
python manage.py migrate
python manage.py createsuperuser
```

## 6. Verify

Visit `https://your-service-name.onrender.com/admin/` — you should see
the Django login page. If the first request is slow (30–60 seconds),
that's the free tier waking up from sleep — expected, not a bug.

## What's different from local dev
- `DEBUG=False` means Django shows plain error pages instead of detailed
  tracebacks — check the **Logs** tab in Render's dashboard instead if
  something breaks.
- The database is real and shared — don't run destructive test data
  scripts against it casually the way you might locally.
