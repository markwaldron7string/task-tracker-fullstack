const LOCAL_TASKS_API_URL = 'http://localhost:5226/api/tasks';
const SAME_ORIGIN_TASKS_API_URL = '/api/tasks';

export function defaultTasksApiUrl(): string {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? LOCAL_TASKS_API_URL
    : SAME_ORIGIN_TASKS_API_URL;
}

export function normalizeTasksApiUrl(tasksApiUrl?: string): string {
  const trimmedUrl = tasksApiUrl?.trim();
  return trimmedUrl ? trimmedUrl.replace(/\/+$/, '') : defaultTasksApiUrl();
}

export function coachChatApiUrl(tasksApiUrl?: string): string {
  const base = normalizeTasksApiUrl(tasksApiUrl);
  return base.replace(/\/tasks\/?$/i, '/coach/chat');
}
