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
