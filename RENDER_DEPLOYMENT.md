# API Hosting On Render (Free)

The Angular app stays on Vercel. The ASP.NET Core API runs on [Render](https://render.com) as a free Docker web service. No Azure subscription and no credit card are required.

Free Render web services sleep after 15 minutes idle and take about a minute to wake. SQLite lives on an ephemeral disk, so data can reset on deploys or instance replacement. The frontend already caches tasks offline, which is enough for this project.

## 1. Create The Render Service

1. Sign up at [dashboard.render.com/register](https://dashboard.render.com/register).
2. Click **New > Blueprint**.
3. Connect the `task-tracker-fullstack` GitHub repo and apply `render.yaml`.
4. Until this is merged to `main`, set the Blueprint **branch** to `cursor/azure-app-service-recovery-1ecc`.
5. Choose the **Free** instance type.
6. Paste a Gemini key into the empty `Coach__ApiKey` secret (or leave it blank for now).

Or create a **Web Service** manually:

- Runtime: Docker
- Dockerfile path: `server/Dockerfile`
- Docker context: `server`
- Health check: `/health`
- Instance type: Free

The public URL will look like:

```text
https://task-tracker-api-mark.onrender.com
```

If that name is already taken, Render will assign a suffix. Use the URL shown on the service page.

### If a Blueprint sync already failed

The first sync used the name `task-tracker-api`, which is often already taken on Render (`*.onrender.com` names are global). This Blueprint now uses `task-tracker-api-mark`.

1. Open the failed **Create web service** step and copy the build log if it failed again later.
2. If Resources lists a failed `task-tracker-api` service, delete it.
3. After this repo has the latest commit, click **Manual sync**.

## 2. Environment Variables (Render only)

`Coach__ApiKey` belongs on **Render**, not Vercel. The browser never calls Gemini; the API does.

### Get a free Gemini key

1. Open [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with a Google account
3. Click **Create API key**
4. Copy the key (it starts with `AIza`)

A key you set with `dotnet user-secrets` on your laptop stays on that machine. Render needs its own copy.

### Paste it into Render

On the Blueprint form, `Coach__ApiKey` is the empty secret field. Paste the Gemini key there.

If the service already exists: **Render Dashboard > task-tracker-api-mark > Environment > Environment Variables > Coach__ApiKey**.

You can leave it blank for now. Coach still works with the on-device planner until the key is set.

## 3. Point Vercel At The API

Do **not** add `Coach__ApiKey` in Vercel.

`TASKS_API_URL` is already set. After Render is live, **edit** that existing variable (do not create a second one). Change the value from the old Azure URL to:

```text
TASKS_API_URL=https://<your-render-service>.onrender.com/api/tasks
```

Example once the default name is free:

```text
TASKS_API_URL=https://task-tracker-api-mark.onrender.com/api/tasks
```

Keep Production and Preview selected, save, then **Redeploy** the frontend.

## 4. Smoke Test

Wait for the first Render deploy (it can take a few minutes while Docker builds). Then open:

```text
https://<your-render-service>.onrender.com/health
```

You should see `{"status":"ok"}`. The first request after idle may take ~30–60 seconds.

If the browser console shows a CORS error, `Cors__AllowedOrigins__0` must match the Vercel origin exactly (`https://task-tracker-fullstack-nu.vercel.app`).

Later pushes to `main` that change `server/` rebuild automatically when the GitHub repo is connected.
