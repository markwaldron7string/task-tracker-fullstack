# Task Tracker Client

Angular frontend for Task Tracker. The app displays tasks, keeps derived views in sync with signals, and talks to the ASP.NET Core API over HTTP.

## Tech

- Angular 22
- TypeScript 6
- Standalone components
- Angular Router
- Angular signals
- HttpClient
- Vitest/Angular TestBed

## Features

- Responsive task list and navigation for desktop and mobile
- Installable Progressive Web App shell with app manifest and icons
- Offline-first task editing with queued API sync
- Add, edit, complete, clear, and delete tasks
- All, active, and completed routes
- Runtime API configuration through `public/app-config.json`

## Running Locally

```bash
yarn install
yarn start
```

The dev server runs at:

```text
http://localhost:4200
```

Local API requests default to:

```text
http://localhost:5226/api/tasks
```

For deployed builds, set `TASKS_API_URL` before running `yarn build`. The build writes `public/app-config.json`, and `TaskStore` reads that file at runtime.

## Scripts

```bash
yarn start    # Angular dev server
yarn build    # writes runtime config, then builds
yarn test     # interactive tests
yarn test:ci  # one-shot test run for CI
```

## Install On Phone

Builds include a web manifest and Angular service worker. After deploying to Vercel, open the live URL on your phone:

- iPhone: Safari > Share > Add to Home Screen.
- Android: Chrome > Install app.

## Offline Editing

`TaskStore` writes task changes to browser storage immediately, marks unsynced tasks as pending, and queues API changes while offline. When the browser comes back online, the queue is replayed against the configured task API.

## Structure

```text
src/app/
├── app.ts
├── app.routes.ts
├── task-store.ts
├── task-list/
├── task-item/
├── task-summary/
├── active/
└── completed/
```
