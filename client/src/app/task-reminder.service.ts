import { Injectable, effect, inject, signal } from '@angular/core';
import { RecurrenceRule } from './task-recurrence';
import { Task, TaskStore } from './task-store';

const SETTINGS_KEY = 'ttf-task-reminder-settings-v2';
const FIRED_KEY = 'ttf-reminder-fired-v2';
const MASTER_KEY = 'ttf-reminders-master-v1';
const DEFAULT_TIME = '09:00';

export type ReminderPermissionState = 'unsupported' | 'denied' | 'prompt' | 'granted';

export interface TaskReminderConfig {
  enabled: boolean;
  remindDate: string;
  remindTime: string;
  recurrence: RecurrenceRule | null;
  recurrenceDays: number[] | null;
  recurrenceMonthDays: number[] | null;
}

export interface TaskReminderSave {
  enabled: boolean;
  remindDate: string;
  remindTime: string;
  recurrence: RecurrenceRule | null;
  recurrenceDays?: number[] | null;
  recurrenceMonthDays?: number[] | null;
}

@Injectable({ providedIn: 'root' })
export class TaskReminderService {
  private store = inject(TaskStore);
  private settings = new Map<number, TaskReminderConfig>(this.loadSettings());
  private firedKeys = new Set<string>(this.loadFired());
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  readonly masterEnabled = signal(this.loadMaster());

  constructor() {
    effect(() => {
      const taskIds = new Set(this.store.tasks().map(task => task.id));
      let changed = false;
      for (const id of [...this.settings.keys()]) {
        if (!taskIds.has(id)) {
          this.settings.delete(id);
          changed = true;
        }
      }
      if (changed) this.persistSettings();
      this.reschedule(this.store.tasks());
    });
  }

  permissionState(): ReminderPermissionState {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission as ReminderPermissionState;
  }

  isMasterEnabled(): boolean {
    return this.masterEnabled();
  }

  setMasterEnabled(enabled: boolean): void {
    this.masterEnabled.set(enabled);
    writeStoredJson(MASTER_KEY, enabled);
    this.reschedule(this.store.tasks());
  }

  getConfig(taskId: number): TaskReminderConfig | null {
    return this.settings.get(taskId) ?? null;
  }

  isEnabled(taskId: number): boolean {
    const config = this.settings.get(taskId);
    return !!config?.enabled && this.masterEnabled();
  }

  buildDefaultConfig(task: Task): TaskReminderConfig {
    const existing = this.settings.get(task.id);
    if (existing) return { ...existing };

    return {
      enabled: false,
      remindDate: task.due ?? todayIso(),
      remindTime: DEFAULT_TIME,
      recurrence: task.recurrence,
      recurrenceDays: null,
      recurrenceMonthDays: null,
    };
  }

  async saveConfig(taskId: number, save: TaskReminderSave): Promise<boolean> {
    if (save.enabled) {
      const granted = await this.ensurePermission();
      if (!granted) return false;
    }

    this.settings.set(taskId, {
      enabled: save.enabled,
      remindDate: save.remindDate,
      remindTime: save.remindTime,
      recurrence: save.recurrence,
      recurrenceDays: save.recurrenceDays ?? null,
      recurrenceMonthDays: save.recurrenceMonthDays ?? null,
    });
    this.clearFiredForTask(taskId);
    this.persistSettings();
    this.reschedule(this.store.tasks());
    return true;
  }

  async toggleEnabled(task: Task): Promise<'opened' | 'disabled' | 'blocked'> {
    if (!this.masterEnabled()) return 'blocked';

    const config = this.settings.get(task.id);
    if (config?.enabled) {
      this.settings.set(task.id, { ...config, enabled: false });
      this.persistSettings();
      this.reschedule(this.store.tasks());
      return 'disabled';
    }

    if (!config) {
      return 'opened';
    }

    const granted = await this.ensurePermission();
    if (!granted) return 'blocked';

    this.settings.set(task.id, { ...config, enabled: true });
    this.clearFiredForTask(task.id);
    this.persistSettings();
    this.reschedule(this.store.tasks());
    return 'disabled';
  }

  async ensurePermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  }

  private reschedule(tasks: Task[]): void {
    this.clearTimers();
    if (!this.masterEnabled()) return;

    const now = Date.now();
    let nextFire = Infinity;

    for (const task of tasks) {
      if (task.done) continue;
      const config = this.settings.get(task.id);
      if (!config?.enabled) continue;

      const firedKey = firedKeyFor(task.id, config);
      if (this.firedKeys.has(firedKey)) continue;

      const fireAt = configToTimestamp(config);
      if (fireAt <= now) {
        this.fireReminder(task, config);
        this.firedKeys.add(firedKey);
        this.persistFired();
      } else if (fireAt < nextFire) {
        nextFire = fireAt;
      }
    }

    if (nextFire < Infinity) {
      this.timerId = setTimeout(() => this.tick(), nextFire - now + 250);
    }

    this.intervalId = setInterval(() => this.tick(), 60_000);
  }

  private tick(): void {
    this.reschedule(this.store.tasks());
  }

  private fireReminder(task: Task, config: TaskReminderConfig): void {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const when = formatReminderWhen(config);
    try {
      new Notification('Task reminder', {
        body: `${task.title} · ${when}`,
        icon: '/favicon.svg',
        tag: firedKeyFor(task.id, config),
      });
    } catch {
      // Ignore blocked notification environments.
    }
  }

  private clearFiredForTask(taskId: number): void {
    for (const key of [...this.firedKeys]) {
      if (key.startsWith(`${taskId}:`)) this.firedKeys.delete(key);
    }
    this.persistFired();
  }

  private clearTimers(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private loadSettings(): Array<[number, TaskReminderConfig]> {
    const raw = readStoredJson<Record<string, TaskReminderConfig>>(SETTINGS_KEY, {});
    return Object.entries(raw)
      .map(([id, config]) => {
        const normalized: TaskReminderConfig = {
          enabled: !!config.enabled,
          remindDate: config.remindDate,
          remindTime: config.remindTime ?? DEFAULT_TIME,
          recurrence: config.recurrence ?? null,
          recurrenceDays: config.recurrenceDays ?? null,
          recurrenceMonthDays: config.recurrenceMonthDays ?? null,
        };
        return [Number(id), normalized] as [number, TaskReminderConfig];
      })
      .filter(([id]) => Number.isFinite(id));
  }

  private persistSettings(): void {
    const payload: Record<string, TaskReminderConfig> = {};
    for (const [id, config] of this.settings.entries()) {
      payload[String(id)] = config;
    }
    writeStoredJson(SETTINGS_KEY, payload);
  }

  private loadFired(): string[] {
    return readStoredJson<string[]>(FIRED_KEY, []);
  }

  private persistFired(): void {
    writeStoredJson(FIRED_KEY, [...this.firedKeys]);
  }

  private loadMaster(): boolean {
    const value = readStoredJson<boolean | null>(MASTER_KEY, null);
    return value ?? true;
  }
}

export function configToTimestamp(config: Pick<TaskReminderConfig, 'remindDate' | 'remindTime'>): number {
  return new Date(`${config.remindDate}T${config.remindTime}:00`).getTime();
}

export function firedKeyFor(taskId: number, config: Pick<TaskReminderConfig, 'remindDate' | 'remindTime'>): string {
  return `${taskId}:${config.remindDate}T${config.remindTime}`;
}

export function formatReminderWhen(config: Pick<TaskReminderConfig, 'remindDate' | 'remindTime'>): string {
  const date = new Date(`${config.remindDate}T${config.remindTime}:00`);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}
