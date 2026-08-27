# Azure Backend Deployment (legacy)

Azure App Service is no longer the default host for this API. The free-trial
subscription that ran `task-tracker-fullstack-api-mark` was deactivated, and
the replacement path is **Render** (no credit card). See
[RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md).

Keep this file only if you later choose a paid Azure subscription. The old
Windows `win-x86` GitHub Actions publish workflow was removed so deploys no
longer target a missing App Service.

Required Azure app settings, if you do recreate one:

```text
ConnectionStrings__Tasks=Data Source=D:/home/data/tasks.db
Cors__AllowedOrigins__0=https://task-tracker-fullstack-nu.vercel.app
Coach__ApiKey=<your-llm-api-key>
```
