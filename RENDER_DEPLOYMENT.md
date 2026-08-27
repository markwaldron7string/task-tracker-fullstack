# API Hosting On Render (Free)

The Angular app stays on Vercel. The ASP.NET Core API runs on [Render](https://render.com) as a free Docker web service. No Azure subscription and no credit card are required.

Free Render web services sleep after 15 minutes idle and take about a minute to wake. SQLite lives on an ephemeral disk, so data can reset on deploys or instance replacement. The frontend already caches tasks offline, which is enough for this project.

## 1. Create The Render Service

1. Sign up at [dashboard.render.com/register](https://dashboard.render.com/register).
2. Click **New > Blueprint**.
3. Connect the `task-tracker-fullstack` GitHub repo and apply `render.yaml`.
4. Choose the **Free** instance type.

Or create a **Web Service** manually:

- Runtime: Docker
- Dockerfile path: `server/Dockerfile`
- Docker context: `server`
- Health check: `/health`
- Instance type: Free

The public URL will look like:

```text
https://task-tracker-api.onrender.com
```

## 2. Environment Variables

Render Blueprint sets CORS and the SQLite path. Add the Coach key in the dashboard (it is marked `sync: false` so it is not committed):

```text
Coach__ApiKey=<your-llm-api-key>
```

Optional extras:

```text
Cors__AllowedOrigins__0=https://task-tracker-fullstack-nu.vercel.app
ConnectionStrings__Tasks=Data Source=/tmp/data/tasks.db
```

## 3. Point Vercel At The API

In the Vercel project for `client/`:

```text
TASKS_API_URL=https://<your-render-service>.onrender.com/api/tasks
```

Redeploy the frontend after setting it.

## 4. Smoke Test

Wait for the first Render deploy (it can take a few minutes while Docker builds). Then open:

```text
https://<your-render-service>.onrender.com/health
```

You should see `{"status":"ok"}`. The first request after idle may take ~30–60 seconds.

If the browser console shows a CORS error, `Cors__AllowedOrigins__0` must match the Vercel origin exactly.

Later pushes to `main` that change `server/` rebuild automatically when the GitHub repo is connected.
