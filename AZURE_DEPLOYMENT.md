# Azure Backend Deployment

This repo deploys as two separate apps:

- `client/` stays on Vercel.
- `server/` deploys to Azure App Service as the ASP.NET Core API.

## 1. Create The Azure Web App

In the Azure Portal, create an App Service Web App:

- Publish: `Code`
- Runtime stack: `.NET 10`
- Operating system: `Windows`
- Pricing plan: `Free F1` is fine for this learning project.

Pick a globally unique app name, for example `task-tracker-fullstack-api-yourname`. Your API URL will be:

```text
https://<your-app-name>.azurewebsites.net
```

## 2. Configure Azure App Settings

In the Azure Web App, go to **Settings > Environment variables** and add:

```text
ConnectionStrings__Tasks=Data Source=D:/home/data/tasks.db
Cors__AllowedOrigins__0=https://<your-vercel-project>.vercel.app
```

The SQLite database is created automatically when the API starts. For a real production app, use Azure SQL or PostgreSQL instead of SQLite.

## 3. Configure GitHub Actions

In Azure, download the Web App publish profile:

```text
Azure Web App > Overview > Download publish profile
```

In GitHub, add:

- Repository variable: `AZURE_WEBAPP_NAME` = your Azure Web App name only, not the full URL.
- Repository secret: `AZURE_WEBAPP_PUBLISH_PROFILE` = the full publish profile XML.

The workflow is in `.github/workflows/deploy-api-azure.yml`. It publishes only the `server/` project.
It currently publishes a Windows self-contained `win-x86` package to match the Windows Free App Service plan.

## 4. Configure Vercel

In the Vercel project for `client/`, add this environment variable:

```text
TASKS_API_URL=https://<your-app-name>.azurewebsites.net/api/tasks
```

Redeploy the Vercel frontend after setting it.

## 5. Smoke Test

After the GitHub Action deploys successfully, open:

```text
https://<your-app-name>.azurewebsites.net/health
https://<your-app-name>.azurewebsites.net/api/tasks
```

Then open the Vercel app and add a task. If the browser console shows a CORS error, double-check `Cors__AllowedOrigins__0` exactly matches the Vercel site origin.

## Troubleshooting: Resource not found / subscription could not be found

If the Azure portal shows **Resource not found (404)** for
`task-tracker-fullstack-api-mark` and the status message is that the
**subscription could not be found**, the App Service is gone. Updating
`Coach:ApiKey` in this repo cannot reach a backend that no longer exists.

Typical causes:

- The Azure **free/trial/student subscription expired or was deleted**
- You are signed into a **different directory** than the one that owned the app
- The App Service or its resource group (`task-tracker-rg`) was deleted

Confirm it from a terminal:

```bash
curl -I https://task-tracker-fullstack-api-mark-h5aje3baaagnhvah.westus3-01.azurewebsites.net/health
```

`Could not resolve host` means the site is deleted, not misconfigured.

### 1. Check you are in the right directory

In the Azure portal, open the directory/subscription switcher next to your
account (top right). If another directory still has a subscription, switch to
it and look under **App Services** again.

If no subscriptions appear, create a new one (pay-as-you-go or another free
trial) in this directory. You cannot attach app settings to a missing
subscription.

### 2. Recreate the App Service

Create a new Web App:

- Resource group: `task-tracker-rg` (or a new name)
- Name: `task-tracker-fullstack-api-mark` if it is still available, otherwise a new unique name
- Publish: `Code`
- Runtime: `.NET 10`
- OS: `Windows`
- Plan: `Free F1`

The public URL will be:

```text
https://<your-app-name>.azurewebsites.net
```

If Azure assigns a regional hostname, use that exact URL everywhere (health
check, GitHub, Vercel).

### 3. Set App Service environment variables

**Settings > Environment variables:**

```text
ConnectionStrings__Tasks=Data Source=D:/home/data/tasks.db
Cors__AllowedOrigins__0=https://task-tracker-fullstack-nu.vercel.app
Coach__ApiKey=<your-llm-api-key>
```

SQLite on the Free plan is wiped if the app is recreated or the file is on
ephemeral storage after a scale event. That is expected for this project.

### 4. Reconnect GitHub Actions

The old publish profile is invalid once the app is deleted.

1. In the new Web App: **Overview > Download publish profile**
2. GitHub repo **Settings > Secrets and variables > Actions**
   - Variable `AZURE_WEBAPP_NAME` = the new app name only
   - Secret `AZURE_WEBAPP_PUBLISH_PROFILE` = the new XML (replace the old one)
3. Run **Deploy API to Azure App Service** with **Run workflow**

### 5. Point Vercel at the new API

If the hostname changed, update `TASKS_API_URL` on the Vercel project:

```text
TASKS_API_URL=https://<your-app-name>.azurewebsites.net/api/tasks
```

Redeploy the frontend. Until this is set, the live Vercel app will keep
calling the dead Azure hostname.
