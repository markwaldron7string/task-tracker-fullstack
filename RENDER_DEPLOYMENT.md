# API Hosting On Render (Free)

The Angular app stays on Vercel. The ASP.NET Core API runs on [Render](https://render.com) as a free Docker web service. Azure App Service is no longer used.

**Live service:** [https://task-tracker-api-i1hl.onrender.com](https://task-tracker-api-i1hl.onrender.com)

Free Render web services sleep after 15 minutes idle and take about a minute to wake. SQLite lives on an ephemeral disk, so data can reset on deploys or instance replacement. The frontend already caches tasks offline, which is enough for this project.

## 1. The Live Service

The running web service is **task-tracker-api** (Render assigned the `i1hl` hostname suffix). Dashboard: **Render → task-tracker-api**.

To recreate it from scratch:

1. Sign up at [dashboard.render.com/register](https://dashboard.render.com/register).
2. Click **New > Blueprint**.
3. Connect the `task-tracker-fullstack` GitHub repo and apply `render.yaml`.
4. Choose the **Free** instance type.
5. Paste a Gemini key into the empty `Coach__ApiKey` secret (or leave it blank for now).

Or create a **Web Service** manually:

- Runtime: Docker
- Dockerfile path: `server/Dockerfile`
- Docker context: `server`
- Health check: `/health`
- Instance type: Free

## 2. Environment Variables (Render only)

`Coach__ApiKey` belongs on **Render**, not Vercel. The browser never calls Gemini; the API does.

A key in a project file or in `dotnet user-secrets` on your laptop is a **different copy**. Render will not read it. The two keys do not need to match; each environment just needs a valid Gemini key (`AIza…`).

### Get a free Gemini key

1. Open [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with a Google account
3. Click **Create API key**
4. Copy the key (it starts with `AIza`)

### Paste it into Render

**Render Dashboard > task-tracker-api > Environment > Environment Variables > Coach__ApiKey**.

You can leave it blank. Coach still works with the on-device planner until the key is set.

## 3. Point Vercel At The API

Do **not** add `Coach__ApiKey` in Vercel.

Edit the existing `TASKS_API_URL` (do not create a second one):

```text
TASKS_API_URL=https://task-tracker-api-i1hl.onrender.com/api/tasks
```

Keep Production and Preview selected, save, then **Redeploy** the frontend.

## 4. Smoke Test

```text
https://task-tracker-api-i1hl.onrender.com/health
```

You should see `{"status":"ok"}`. The first request after idle may take ~30–60 seconds.

If the browser console shows a CORS error, `Cors__AllowedOrigins__0` must match the Vercel origin exactly (`https://task-tracker-fullstack-nu.vercel.app`).

Later pushes to `main` that change `server/` rebuild automatically.
