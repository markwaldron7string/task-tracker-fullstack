# Task Tracker Fullstack

[![CI](https://github.com/markwaldron7string/task-tracker-fullstack/actions/workflows/ci.yml/badge.svg)](https://github.com/markwaldron7string/task-tracker-fullstack/actions/workflows/ci.yml)
[![Azure API Deploy](https://github.com/markwaldron7string/task-tracker-fullstack/actions/workflows/deploy-api-azure.yml/badge.svg)](https://github.com/markwaldron7string/task-tracker-fullstack/actions/workflows/deploy-api-azure.yml)
![Angular](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![.NET](https://img.shields.io/badge/.NET-10-512BD4?logo=dotnet&logoColor=white)
![ASP.NET Core](https://img.shields.io/badge/ASP.NET%20Core-Minimal%20API-512BD4)
![Entity Framework Core](https://img.shields.io/badge/EF%20Core-10-6C33AF)
![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-frontend%20tests-6E9F18?logo=vitest&logoColor=white)
![xUnit](https://img.shields.io/badge/xUnit-backend%20tests-512BD4)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-frontend-000000?logo=vercel&logoColor=white)
![Azure App Service](https://img.shields.io/badge/Azure%20App%20Service-backend-0078D4?logo=microsoftazure&logoColor=white)

A full-stack task manager built with Angular and ASP.NET Core. The Angular single-page app reads and writes tasks through a C# Minimal API, and the API persists data with Entity Framework Core and SQLite.

This is a learning project, but it is wired like a real full-stack app: separate frontend/backend deployment, runtime configuration, database migrations, CI, and integration tests.

## Live App

- Frontend: [task-tracker-fullstack-nu.vercel.app](https://task-tracker-fullstack-nu.vercel.app)
- API health check: [Azure `/health`](https://task-tracker-fullstack-api-mark-h5aje3baaagnhvah.westus3-01.azurewebsites.net/health)
- API tasks endpoint: [Azure `/api/tasks`](https://task-tracker-fullstack-api-mark-h5aje3baaagnhvah.westus3-01.azurewebsites.net/api/tasks)

## Features

- Add, edit, complete, and delete tasks
- View all, active, and completed tasks
- Responsive layout for desktop and mobile
- Installable Progressive Web App for phone home screens
- Live remaining-task count with Angular signals
- REST API with CRUD endpoints and validation
- SQLite persistence with EF Core migrations
- Frontend hosted on Vercel, backend hosted on Azure App Service

## Architecture

```text
client/ Angular SPA on Vercel
   |
   | HTTP JSON
   v
server/ ASP.NET Core Minimal API on Azure App Service
   |
   v
SQLite database in Azure App Service storage
```

## Tech Stack

| Area | Tools |
| --- | --- |
| Frontend | Angular 22, TypeScript 6, Angular Router, HttpClient, signals |
| Backend | .NET 10, ASP.NET Core Minimal APIs, Entity Framework Core 10 |
| Database | SQLite, EF Core migrations |
| Tests | Vitest/Angular TestBed, xUnit, ASP.NET Core WebApplicationFactory |
| Deployment | Vercel, Azure App Service, GitHub Actions |

## Repository Layout

```text
.
├── client/                    # Angular frontend
├── server/                    # ASP.NET Core API
├── tests/TaskTracker.Api.Tests/ # Backend integration tests
├── .github/workflows/         # CI and Azure deployment workflows
├── AZURE_DEPLOYMENT.md        # Azure setup notes
└── TaskTracker.slnx           # .NET solution
```

## Running Locally

Start the backend first:

```bash
cd server
dotnet run
```

The API runs at:

```text
http://localhost:5226
```

Then start the frontend:

```bash
cd client
yarn install
yarn start
```

The Angular app runs at:

```text
http://localhost:4200
```

Local frontend builds default to `http://localhost:5226/api/tasks`. Deployed frontend builds read `TASKS_API_URL` from Vercel and write it into `client/public/app-config.json`.

## Testing

Run backend tests:

```bash
dotnet test TaskTracker.slnx
```

Run frontend tests:

```bash
cd client
yarn test:ci
```

Build frontend:

```bash
cd client
yarn build
```

Check backend packages for known vulnerabilities:

```bash
dotnet list server/TaskTracker.Api.csproj package --vulnerable --include-transitive
```

## API

Base URL locally:

```text
http://localhost:5226/api/tasks
```

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/health` | API health check |
| `GET` | `/api/tasks` | List all tasks |
| `GET` | `/api/tasks/{id}` | Get one task |
| `POST` | `/api/tasks` | Create a task |
| `PUT` | `/api/tasks/{id}` | Update a task |
| `DELETE` | `/api/tasks/{id}` | Delete one task |
| `DELETE` | `/api/tasks` | Delete all tasks |

## Deployment

The frontend deploys to Vercel. Set this Vercel environment variable:

```text
TASKS_API_URL=https://task-tracker-fullstack-api-mark-h5aje3baaagnhvah.westus3-01.azurewebsites.net/api/tasks
```

The backend deploys to Azure App Service through `.github/workflows/deploy-api-azure.yml`.

Required GitHub Actions settings:

```text
AZURE_WEBAPP_NAME=task-tracker-fullstack-api-mark
AZURE_WEBAPP_PUBLISH_PROFILE=<Azure publish profile XML>
```

Required Azure App Service app settings:

```text
ConnectionStrings__Tasks=Data Source=D:/home/data/tasks.db
Cors__AllowedOrigins__0=https://task-tracker-fullstack-nu.vercel.app
```

More detail is in [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md).

## Install On Phone

After the Vercel deployment finishes, open the frontend URL on your phone:

- iPhone: open in Safari, tap Share, then tap **Add to Home Screen**.
- Android: open in Chrome, tap the install prompt or menu, then tap **Install app**.

The PWA installs with its own home-screen icon and standalone app window. Task data still syncs through the Azure API, so the app needs a network connection for live task changes.
