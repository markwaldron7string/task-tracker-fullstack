# Task Tracker Fullstack

[![CI](https://github.com/markwaldron7string/task-tracker-fullstack/actions/workflows/ci.yml/badge.svg)](https://github.com/markwaldron7string/task-tracker-fullstack/actions/workflows/ci.yml)
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
![Render](https://img.shields.io/badge/Render-API-46E3B7?logo=render&logoColor=white)

A full-stack task manager built with Angular and ASP.NET Core. The Angular single-page app reads and writes tasks through a C# Minimal API, and the API persists data with Entity Framework Core and SQLite.

This is a learning project, but it is wired like a real full-stack app: separate frontend/backend deployment, runtime configuration, database migrations, CI, integration tests, offline sync, and an optional AI planning coach.

## Live App

- Frontend: [task-tracker-fullstack-nu.vercel.app](https://task-tracker-fullstack-nu.vercel.app)
- API: Render free web service. After the first deploy, set Vercel `TASKS_API_URL` to `https://<your-render-service>.onrender.com/api/tasks`. Setup is in [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md).

## Features

### Core task management

- Add, edit, complete, and delete tasks
- Quick-add syntax: `Review PR tomorrow 30m high` (title, due date, estimate, priority)
- Priority flags, due dates, and time estimates on every task
- Views: **All Tasks**, **Today**, **Calendar**, **Active**, **Completed**
- **Clear all** with confirmation dialog
- Live remaining-task count with Angular signals

### Calendar and planning

- Month and week calendar with drag-and-drop scheduling
- Day panel for adding and editing tasks on a selected date
- Unscheduled task inbox — drag tasks onto days or use **Schedule**
- Click a calendar day (or task chip) to open **Details** when a task has a checklist

### Pro: AI Planning Coach

- Floating **Coach** panel with task-aware suggestions (overdue, overcommitted, unscheduled)
- Cloud LLM when a Gemini key is set on the API, with on-device rule-based fallback otherwise
- Multi-day plan generation (e.g. *30-day workout plan with meals*) with per-day checklists
- **Apply to calendar** creates scheduled tasks with detailed sub-steps
- Conversation history across turns; minimize (−), close (×), or click outside to dismiss

### Task checklists

- Plan tasks include checklist items (exercises, meals, steps) stored on the task
- **Details** button on task rows opens a checklist you can check off as you go
- Completing all checklist items marks the parent task done

### Offline and PWA

- Installable Progressive Web App for phone home screens
- Offline task editing with queued sync when the connection returns
- Local task cache and sync queue in browser storage

### Themes

- Multiple color themes including light, dark, and custom palettes
- Theme picker in the header; preference persisted locally

## Architecture

```text
client/ Angular SPA on Vercel
   |
   | HTTP JSON (X-User-ID header for per-device identity)
   v
server/ ASP.NET Core Minimal API on Render
   |
   +-- SQLite database (tasks)
   +-- Coach service (cloud LLM when a key is set, otherwise local stub)
```

## Tech Stack

| Area | Tools |
| --- | --- |
| Frontend | Angular 22, TypeScript 6, Angular Router, HttpClient, signals, PWA |
| Backend | .NET 10, ASP.NET Core Minimal APIs, Entity Framework Core 10 |
| AI Coach | Gemini 2.5 Flash by default (optional Groq/OpenAI), structured JSON schedule output |
| Database | SQLite, EF Core migrations |
| Tests | Vitest/Angular TestBed (30 tests), xUnit/WebApplicationFactory (11 tests) |
| Deployment | Vercel (frontend), Render (API), GitHub Actions CI |

## Repository Layout

```text
.
├── client/                       # Angular frontend
│   └── src/app/
│       ├── pro-assistant/        # AI Planning Coach UI
│       ├── pro-coach.ts          # On-device coach logic
│       ├── calendar/             # Calendar view
│       ├── today/                # Today focus view
│       └── task-store.ts         # Offline-first task state + sync
├── server/
│   ├── Program.cs                # API endpoints
│   └── Coach/                    # LLM coach providers and schedule parsing
├── tests/TaskTracker.Api.Tests/  # Backend integration tests
├── .github/workflows/            # CI
├── render.yaml                   # Render Blueprint for the API
├── RENDER_DEPLOYMENT.md          # Free Render API setup
└── TaskTracker.slnx              # .NET solution
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

### AI Coach (optional, local)

The coach uses **Google Gemini 2.5 Flash** (free) when an API key is set. Create a key at [Google AI Studio](https://aistudio.google.com/apikey):

```bash
cd server
dotnet user-secrets set "Coach:ApiKey" "AIza-your-gemini-key"
```

Restart the API. The coach panel will show **Powered by AI** when the cloud provider responds.

## Testing

Run all backend tests:

```bash
dotnet test TaskTracker.slnx --configuration Release
```

Run frontend tests:

```bash
cd client
yarn test:ci
```

Production build:

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
http://localhost:5226
```

All task routes require an `X-User-ID` header (the client generates and persists a UUID per browser).

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/health` | API health check |
| `GET` | `/api/tasks` | List all tasks for the user |
| `GET` | `/api/tasks/{id}` | Get one task |
| `POST` | `/api/tasks` | Create a task |
| `PUT` | `/api/tasks/{id}` | Update a task |
| `DELETE` | `/api/tasks/{id}` | Delete one task |
| `DELETE` | `/api/tasks` | Delete all tasks for the user |
| `POST` | `/api/coach/chat` | AI planning coach (question + task snapshot + optional history) |

### Task fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | int | Auto-increment |
| `title` | string | Required |
| `done` | bool | Task completion |
| `priority` | string | `none`, `low`, `medium`, `high` |
| `due` | string | ISO date `YYYY-MM-DD` or null |
| `estimateMinutes` | int | Optional time estimate |
| `checklist` | array | `{ id, title, done }[]` for plan sub-steps |

## Deployment

Pushes to **`main`** run CI. Vercel deploys the frontend. Render rebuilds the API when `server/` changes (after you connect the repo once).

### Frontend (Vercel)

Edit the existing `TASKS_API_URL` after Render is live. Do not add `Coach__ApiKey` on Vercel.

```text
TASKS_API_URL=https://<your-render-service>.onrender.com/api/tasks
```

### Backend (Render)

Create the free web service from `render.yaml`, then set `Coach__ApiKey` in the Render dashboard. Full steps are in [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md).

## Install On Phone

After the Vercel deployment finishes, open the frontend URL on your phone:

- iPhone: open in Safari, tap Share, then tap **Add to Home Screen**.
- Android: open in Chrome, tap the install prompt or menu, then tap **Install app**.

The PWA installs with its own home-screen icon and standalone app window. Tasks sync through the Render API when online; offline edits queue and sync when connectivity returns.
