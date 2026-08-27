# Task Tracker API

ASP.NET Core Minimal API for Task Tracker. It exposes task CRUD endpoints and persists data through Entity Framework Core and SQLite.

## Tech

- .NET 10
- ASP.NET Core Minimal APIs
- Entity Framework Core 10
- SQLite
- Code-first migrations
- OpenAPI in development

## Running Locally

```bash
dotnet run
```

The API runs at:

```text
http://localhost:5226
```

The default local database is:

```text
server/tasks.db
```

Migrations are applied automatically on startup.

## Configuration

Optional connection string:

```text
ConnectionStrings__Tasks=Data Source=tasks.db
```

Optional CORS origin:

```text
Cors__AllowedOrigins__0=http://localhost:4200
```

On Render, SQLite lives on the ephemeral disk:

```text
ConnectionStrings__Tasks=Data Source=/tmp/data/tasks.db
```

The live API is `https://task-tracker-api-i1hl.onrender.com`. Set `Coach__ApiKey` in the Render dashboard, not in this repo. See [RENDER_DEPLOYMENT.md](../RENDER_DEPLOYMENT.md).

## Endpoints

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/api/tasks` | List tasks |
| `GET` | `/api/tasks/{id}` | Get one task |
| `POST` | `/api/tasks` | Create task |
| `PUT` | `/api/tasks/{id}` | Update task |
| `DELETE` | `/api/tasks/{id}` | Delete one task |
| `DELETE` | `/api/tasks` | Delete all tasks |
| `POST` | `/api/coach/chat` | AI planning coach |

## Tests

Backend integration tests live in:

```text
../tests/TaskTracker.Api.Tests
```

Run them from the repository root:

```bash
dotnet test TaskTracker.slnx
```
