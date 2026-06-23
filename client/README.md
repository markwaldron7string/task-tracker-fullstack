# Task Tracker

A full-stack task management app. An Angular single-page frontend talks to an ASP.NET Core (C#) Web API, which persists tasks to a SQLite database.

Built as a hands-on project to learn modern Angular and C# / ASP.NET Core from the ground up.

## Architecture

```
client/  Angular app (localhost:4200)
   │
   │  HTTP / JSON
   ▼
server/  ASP.NET Core API (localhost:5226)
   │
   ▼
         SQLite database (tasks.db)
```

The frontend holds no data of its own - it reads and writes everything through the API, which persists tasks to a SQLite file. During development, both servers run at the same time.

## Repository layout

```
task-tracker/
├── client/   # Angular 22 frontend  (see client/README.md)
└── server/   # ASP.NET Core C# API  (see server/README.md)
```

## Tech stack

| | |
| --- | --- |
| **Frontend** | Angular 22, TypeScript, signals, standalone components, Angular Router, HttpClient |
| **Backend** | C# / .NET 10, ASP.NET Core Minimal APIs, Entity Framework Core 10, SQLite |

## Running the app

You need two terminals - one per half. **Start the backend first.**

### 1. Backend (`server/`)

```bash
cd server
dotnet tool install --global dotnet-ef   # first time only
dotnet ef database update                # creates tasks.db (first time only)
dotnet watch run
```

Runs on `http://localhost:5226`. Verify at `http://localhost:5226/api/tasks`.

### 2. Frontend (`client/`)

```bash
cd client
npm install                              # first time only
ng serve --open
```

Runs on `http://localhost:4200` and opens in your browser.

See each subfolder's README for full details, prerequisites, and the API reference.

## API summary

Base URL: `http://localhost:5226/api/tasks`

| Method | Route             | Description            |
| ------ | ----------------- | ---------------------- |
| GET    | `/api/tasks`      | List all tasks         |
| GET    | `/api/tasks/{id}` | Get a single task      |
| POST   | `/api/tasks`      | Create a task          |
| PUT    | `/api/tasks/{id}` | Update / toggle a task |
| DELETE | `/api/tasks/{id}` | Delete a single task   |
| DELETE | `/api/tasks`      | Delete all tasks       |

Full request/response details are in [`server/README.md`](server/README.md).

## What this project demonstrates

- A componentized Angular UI with signals, routing, and reactive derived state
- A REST API with full CRUD, validation, and conventional HTTP status codes
- Real persistence via Entity Framework Core and SQLite, managed with code-first migrations
- Frontend and backend connected over HTTP, including CORS and JSON serialization between two languages

---

*A personal learning project.*