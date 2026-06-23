import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';

export interface Task {
  id: number;
  title: string;
  done: boolean;
  pending?: boolean;
}

interface AppConfig {
  tasksApiUrl?: string;
}

type SyncStatus = 'loading' | 'synced' | 'syncing' | 'offline' | 'error';

interface QueuedTaskChange {
  id: string;
  type: 'create' | 'update' | 'delete';
  taskId: number;
  title?: string;
  done?: boolean;
  createdAt: string;
}

const LOCAL_TASKS_API_URL = 'http://localhost:5226/api/tasks';
const SAME_ORIGIN_TASKS_API_URL = '/api/tasks';
const LOCAL_TASKS_STORAGE_KEY = 'ttf-offline-tasks-v1';
const SYNC_QUEUE_STORAGE_KEY = 'ttf-sync-queue-v1';

function defaultTasksApiUrl() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? LOCAL_TASKS_API_URL
    : SAME_ORIGIN_TASKS_API_URL;
}

function normalizeTasksApiUrl(tasksApiUrl?: string) {
  const trimmedUrl = tasksApiUrl?.trim();
  return trimmedUrl ? trimmedUrl.replace(/\/+$/, '') : defaultTasksApiUrl();
}

function stripPending(task: Task): Task {
  return { id: task.id, title: task.title, done: task.done };
}

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const rawValue = localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the in-memory task list usable even if browser storage is unavailable.
  }
}

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private http = inject(HttpClient);
  private tasksApiUrl = defaultTasksApiUrl();
  private queuedChanges: QueuedTaskChange[] = [];
  private syncInProgress = false;
  private syncRequested = false;

  tasks = signal<Task[]>([]);
  syncStatus = signal<SyncStatus>('loading');
  pendingChanges = signal(0);

  remaining = computed(() => this.tasks().filter(task => !task.done).length);
  completedTasks = computed(() => this.tasks().filter(task => task.done));
  activeTasks = computed(() => this.tasks().filter(task => !task.done));
  syncMessage = computed(() => {
    const pendingCount = this.pendingChanges();

    switch (this.syncStatus()) {
      case 'loading':
        return 'Loading tasks...';
      case 'syncing':
        return pendingCount > 0 ? `Syncing ${pendingCount} change(s)...` : 'Syncing...';
      case 'offline':
        return pendingCount > 0 ? `Offline - ${pendingCount} change(s) queued` : 'Offline - saved on this device';
      case 'error':
        return pendingCount > 0 ? `Sync paused - ${pendingCount} change(s) queued` : 'Sync paused';
      case 'synced':
      default:
        return pendingCount > 0 ? `${pendingCount} change(s) queued` : 'Synced';
    }
  });

  constructor() {
    this.restoreLocalState();
    this.registerConnectivityHandlers();
    this.loadConfig();
  }

  loadTasks() {
    void this.syncNow();
  }

  addTask(title: string) {
    const trimmedTitle = title.trim();
    if (trimmedTitle === '') return;

    const task: Task = {
      id: this.nextLocalId(),
      title: trimmedTitle,
      done: false,
      pending: true
    };

    this.setLocalTasks([...this.tasks().map(stripPending), task]);
    this.enqueueChange({
      id: crypto.randomUUID(),
      type: 'create',
      taskId: task.id,
      title: task.title,
      done: task.done,
      createdAt: new Date().toISOString()
    });
    void this.syncNow();
  }

  toggleTask(id: number) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;

    const updatedTask = { ...stripPending(task), done: !task.done };
    this.updateLocalTask(updatedTask);
    this.queueTaskUpdate(updatedTask);
    void this.syncNow();
  }

  editTask(id: number, newTitle: string) {
    const task = this.tasks().find(t => t.id === id);
    const trimmedTitle = newTitle.trim();
    if (!task || trimmedTitle === '') return;

    const updatedTask = { ...stripPending(task), title: trimmedTitle };
    this.updateLocalTask(updatedTask);
    this.queueTaskUpdate(updatedTask);
    void this.syncNow();
  }

  removeTask(id: number) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;

    this.setLocalTasks(this.tasks().filter(t => t.id !== id).map(stripPending));
    this.queueTaskDelete(stripPending(task));
    void this.syncNow();
  }

  clearTasks() {
    const currentTasks = this.tasks().map(stripPending);
    this.setLocalTasks([]);
    this.queueTaskDeletes(currentTasks);
    void this.syncNow();
  }

  private loadConfig() {
    this.http.get<AppConfig>('/app-config.json').pipe(
      catchError(() => of({} as AppConfig))
    ).subscribe(config => {
      this.tasksApiUrl = normalizeTasksApiUrl(config.tasksApiUrl);
      void this.syncNow();
    });
  }

  private restoreLocalState() {
    this.queuedChanges = readStoredJson<QueuedTaskChange[]>(SYNC_QUEUE_STORAGE_KEY, []);
    this.pendingChanges.set(this.queuedChanges.length);
    this.tasks.set(this.withPendingFlags(readStoredJson<Task[]>(LOCAL_TASKS_STORAGE_KEY, [])));
    this.syncStatus.set(this.isOnline() ? 'loading' : 'offline');
  }

  private registerConnectivityHandlers() {
    window.addEventListener('online', () => void this.syncNow());
    window.addEventListener('offline', () => this.syncStatus.set('offline'));
  }

  private async syncNow() {
    if (this.syncInProgress) {
      this.syncRequested = true;
      return;
    }

    do {
      this.syncRequested = false;

      if (!this.isOnline()) {
        this.syncStatus.set('offline');
        return;
      }

      this.syncInProgress = true;
      this.syncStatus.set(this.queuedChanges.length > 0 ? 'syncing' : 'loading');

      try {
        await this.flushQueuedChanges();

        if (this.queuedChanges.length === 0) {
          const remoteTasks = await firstValueFrom(this.http.get<Task[]>(this.tasksApiUrl));

          if (this.queuedChanges.length === 0) {
            this.setLocalTasks(remoteTasks.map(stripPending));
          }
        }

        this.syncStatus.set('synced');
      } catch {
        this.syncStatus.set(this.isOnline() ? 'error' : 'offline');
      } finally {
        this.syncInProgress = false;
      }
    } while (this.syncRequested);
  }

  private async flushQueuedChanges() {
    while (this.queuedChanges.length > 0) {
      const change = this.queuedChanges[0];
      await this.syncChange(change);
      this.queuedChanges = this.queuedChanges.slice(1);
      this.persistQueue();
    }
  }

  private async syncChange(change: QueuedTaskChange) {
    if (change.type === 'create') {
      const createdTask = await firstValueFrom(this.http.post<Task>(this.tasksApiUrl, { title: change.title }));
      const syncedTask = change.done
        ? await firstValueFrom(this.http.put<Task>(`${this.tasksApiUrl}/${createdTask.id}`, {
          title: createdTask.title,
          done: true
        }))
        : createdTask;

      this.replaceLocalTaskId(change.taskId, stripPending(syncedTask));
      return;
    }

    if (change.type === 'update') {
      try {
        const updatedTask = await firstValueFrom(this.http.put<Task>(`${this.tasksApiUrl}/${change.taskId}`, {
          title: change.title,
          done: change.done
        }));
        this.updateLocalTask(stripPending(updatedTask));
      } catch (error) {
        if (!this.isNotFound(error)) throw error;

        const recreatedTask = await firstValueFrom(this.http.post<Task>(this.tasksApiUrl, { title: change.title }));
        const syncedTask = change.done
          ? await firstValueFrom(this.http.put<Task>(`${this.tasksApiUrl}/${recreatedTask.id}`, {
            title: recreatedTask.title,
            done: true
          }))
          : recreatedTask;

        this.replaceLocalTaskId(change.taskId, stripPending(syncedTask));
      }
      return;
    }

    try {
      await firstValueFrom(this.http.delete(`${this.tasksApiUrl}/${change.taskId}`));
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
    }
  }

  private queueTaskUpdate(task: Task) {
    const createChange = this.queuedChanges.find(change => change.type === 'create' && change.taskId === task.id);
    if (createChange) {
      createChange.title = task.title;
      createChange.done = task.done;
      this.persistQueue();
      return;
    }

    if (this.queuedChanges.some(change => change.type === 'delete' && change.taskId === task.id)) return;

    const updateChange = this.queuedChanges.find(change => change.type === 'update' && change.taskId === task.id);
    if (updateChange) {
      updateChange.title = task.title;
      updateChange.done = task.done;
      this.persistQueue();
      return;
    }

    this.enqueueChange({
      id: crypto.randomUUID(),
      type: 'update',
      taskId: task.id,
      title: task.title,
      done: task.done,
      createdAt: new Date().toISOString()
    });
  }

  private queueTaskDelete(task: Task) {
    if (task.id < 0) {
      this.queuedChanges = this.queuedChanges.filter(change => change.taskId !== task.id);
      this.persistQueue();
      return;
    }

    this.queuedChanges = this.queuedChanges.filter(change =>
      !(change.taskId === task.id && change.type === 'update')
    );

    if (!this.queuedChanges.some(change => change.type === 'delete' && change.taskId === task.id)) {
      this.queuedChanges.push({
        id: crypto.randomUUID(),
        type: 'delete',
        taskId: task.id,
        createdAt: new Date().toISOString()
      });
    }

    this.persistQueue();
  }

  private queueTaskDeletes(tasks: Task[]) {
    const taskIds = new Set(tasks.map(task => task.id));
    this.queuedChanges = this.queuedChanges.filter(change => {
      if (!taskIds.has(change.taskId)) return true;
      return change.type === 'delete';
    });

    for (const task of tasks) {
      if (task.id < 0) continue;

      if (!this.queuedChanges.some(change => change.type === 'delete' && change.taskId === task.id)) {
        this.queuedChanges.push({
          id: crypto.randomUUID(),
          type: 'delete',
          taskId: task.id,
          createdAt: new Date().toISOString()
        });
      }
    }

    this.persistQueue();
  }

  private enqueueChange(change: QueuedTaskChange) {
    this.queuedChanges.push(change);
    this.persistQueue();
  }

  private updateLocalTask(task: Task) {
    this.setLocalTasks(this.tasks().map(currentTask =>
      currentTask.id === task.id ? task : stripPending(currentTask)
    ));
  }

  private replaceLocalTaskId(localId: number, serverTask: Task) {
    this.setLocalTasks(this.tasks().map(task =>
      task.id === localId ? serverTask : stripPending(task)
    ));
  }

  private setLocalTasks(tasks: Task[]) {
    const sortedTasks = tasks
      .map(stripPending)
      .sort((a, b) => a.id - b.id);

    this.tasks.set(this.withPendingFlags(sortedTasks));
    writeStoredJson(LOCAL_TASKS_STORAGE_KEY, sortedTasks);
  }

  private persistQueue() {
    this.pendingChanges.set(this.queuedChanges.length);
    writeStoredJson(SYNC_QUEUE_STORAGE_KEY, this.queuedChanges);
    this.tasks.set(this.withPendingFlags(this.tasks().map(stripPending)));
  }

  private withPendingFlags(tasks: Task[]) {
    const pendingTaskIds = new Set(this.queuedChanges.map(change => change.taskId));
    return tasks.map(task => ({ ...stripPending(task), pending: pendingTaskIds.has(task.id) }));
  }

  private nextLocalId() {
    const lowestId = Math.min(0, ...this.tasks().map(task => task.id));
    return lowestId - 1;
  }

  private isOnline() {
    return navigator.onLine;
  }

  private isNotFound(error: unknown) {
    return typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
  }
}
