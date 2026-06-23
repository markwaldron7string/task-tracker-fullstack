# Task Tracker - Client (Angular)

The frontend for **Task Tracker**, a full-stack task management app. This is an Angular single-page app that reads and writes tasks through the Task Tracker API.

> This is one half of the project. The backend (C# / ASP.NET Core) lives in [`../server`](../server). See the [root README](../README.md) for the full picture.

## Features

- Add, complete (checkbox), edit inline, and delete tasks
- Three filtered views via routing - **All tasks**, **Active**, and **Completed**
- Live "remaining" count and task summary that stay in sync automatically
- All data is loaded from and saved to the backend API (no local-only storage)

## Tech stack

- [Angular](https://angular.dev) 22
- TypeScript
- Standalone components (no NgModules)
- Signals - `signal` and `computed`
- Angular Router
- `HttpClient` for REST calls to the API

## Prerequisites

- [Node.js](https://nodejs.org) (LTS version)
- Angular CLI: `npm install -g @angular/cli`
- **The backend API must be running** - see [`../server`](../server). The app expects it at `http://localhost:5226`.

## Running locally

```bash
# install dependencies (first time only)
npm install

# start the dev server and open the browser
ng serve --open
```

The app runs at `http://localhost:4200`. Start the backend API **first**, otherwise the task list will load empty and requests will fail.

> The API base URL is set in `src/app/task-store.ts` (`API_URL`). If your backend runs on a different port, update it there.

## How it works

**One source of truth.** All task state lives in a single signal inside `TaskStore` (`src/app/task-store.ts`). Every component reads from it, so the whole UI stays in sync automatically.

**The store talks to the API.** `TaskStore` injects `HttpClient` and calls the backend for every operation (load, add, toggle, edit, delete). After any change, it re-fetches the list so the UI always reflects the server's state.

**Derived views are computed.** The Active and Completed pages don't keep their own lists - they read `computed` signals (`activeTasks`, `completedTasks`) derived from the single source.

**Components communicate explicitly.** Data flows down into `task-item` through `input()`s, and events (toggle, edit, remove) flow back up through `output()`s for the parent to handle.

## Project structure

```
src/app/
├── app.ts              # Root shell: nav bar + <router-outlet>
├── app.routes.ts       # Routes: '' -> TaskList, 'completed', 'active'
├── app.config.ts       # App providers (router + HttpClient)
│
├── task-store.ts       # Injectable store - holds state, calls the API
│
├── task-list/          # "All tasks" page (add box + full list)
├── active/             # "Active" page (incomplete tasks only)
├── completed/          # "Completed" page (done tasks only)
│
├── task-item/          # Reusable row: checkbox, inline edit, delete
└── task-summary/       # Small reusable task-count summary
```

## Angular concepts demonstrated

- Components, templates, and interpolation
- The binding family: `[property]`, `(event)`, and `[class.x]`
- Signals: `signal` and `computed`
- Control flow blocks: `@for`, `@empty`, and `@if` / `@else`
- Component communication with `input()` and `output()`
- Services and dependency injection via `inject()`
- Client-side routing with `routerLink` and `<router-outlet>`
- Calling a REST API with `HttpClient` and Observables

---

*Part of a personal full-stack learning project built to learn Angular and C# / ASP.NET Core.*