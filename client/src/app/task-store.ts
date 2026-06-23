import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';

export interface Task {
  id: number;
  title: string;
  done: boolean;
}

interface AppConfig {
  tasksApiUrl?: string;
}

const LOCAL_TASKS_API_URL = 'http://localhost:5226/api/tasks';
const SAME_ORIGIN_TASKS_API_URL = '/api/tasks';

function defaultTasksApiUrl() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? LOCAL_TASKS_API_URL
    : SAME_ORIGIN_TASKS_API_URL;
}

function normalizeTasksApiUrl(tasksApiUrl?: string) {
  const trimmedUrl = tasksApiUrl?.trim();
  return trimmedUrl ? trimmedUrl.replace(/\/+$/, '') : defaultTasksApiUrl();
}

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private http = inject(HttpClient);
  private tasksApiUrl = defaultTasksApiUrl();

  tasks = signal<Task[]>([]);

  remaining = computed(() => this.tasks().filter(task => !task.done).length);
  completedTasks = computed(() => this.tasks().filter(task => task.done));
  activeTasks = computed(() => this.tasks().filter(task => !task.done));

  constructor() {
    this.loadConfig();
  }

  loadTasks() {
    this.http.get<Task[]>(this.tasksApiUrl).subscribe(tasks => this.tasks.set(tasks));
  }

  addTask(title: string) {
    const trimmedTitle = title.trim();
    if (trimmedTitle === '') return;
    this.http.post<Task>(this.tasksApiUrl, { title: trimmedTitle }).subscribe(() => this.loadTasks());
  }

  toggleTask(id: number) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;
    this.http.put<Task>(`${this.tasksApiUrl}/${id}`, { title: task.title, done: !task.done })
      .subscribe(() => this.loadTasks());
  }

  editTask(id: number, newTitle: string) {
    const task = this.tasks().find(t => t.id === id);
    const trimmedTitle = newTitle.trim();
    if (!task || trimmedTitle === '') return;
    this.http.put<Task>(`${this.tasksApiUrl}/${id}`, { title: trimmedTitle, done: task.done })
      .subscribe(() => this.loadTasks());
  }

  removeTask(id: number) {
    this.http.delete(`${this.tasksApiUrl}/${id}`).subscribe(() => this.loadTasks());
  }

  clearTasks() {
    this.http.delete(this.tasksApiUrl).subscribe(() => this.loadTasks());
  }

  private loadConfig() {
    this.http.get<AppConfig>('/app-config.json').pipe(
      catchError(() => of({} as AppConfig))
    ).subscribe(config => {
      this.tasksApiUrl = normalizeTasksApiUrl(config.tasksApiUrl);
      this.loadTasks();
    });
  }
}
