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

`Coach__ApiKey` is not in this repo. You create it, then paste it into Render.

### Get a free Gemini key

1. Open [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with a Google account
3. Click **Create API key**
4. Copy the key (it starts with `AIza`)

A key you set with `dotnet user-secrets` on your laptop stays on that machine. Render needs its own copy.

### Paste it into Render

On the Blueprint form, `Coach__ApiKey` is the empty secret field. Paste the Gemini key there.

If the service already exists: **Render Dashboard > task-tracker-api > Environment > Environment Variables > Coach__ApiKey**.

You can leave it blank for now. Coach still works with the on-device planner until the key is set.

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
