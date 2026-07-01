import { Injectable, effect, inject, signal } from '@angular/core';
import { getNotificationSupport, hasNotificationApi, type NotificationSupportStatus } from './notification-support';
import { ProService } from './pro.service';
import { RecurrenceRule } from './task-recurrence';
import { Task, TaskStore } from './task-store';

const SETTINGS_KEY = 'ttf-task-reminder-settings-v2';
const FIRED_KEY = 'ttf-reminder-fired-v2';
const MASTER_KEY = 'ttf-reminders-master-v1';
const DEFAULT_TIME = '09:00';

export type ReminderPermissionState = NotificationSupportStatus;

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
  private pro = inject(ProService);
  private settings = new Map<number, TaskReminderConfig>(this.loadSettings());
  private settingsRevision = signal(0);
  private firedKeys = new Set<string>(this.loadFired());
  private firingKeys = new Set<string>();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  readonly masterEnabled = signal(this.loadMaster());
  readonly notice = signal<string | null>(null);

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
      if (changed) {
        this.markSettingsChanged();
        this.persistSettings();
      }
      this.reschedule(this.store.tasks());
    });
  }

  permissionState(): ReminderPermissionState {
    return getNotificationSupport().status;
  }

  permissionMessage(): string | null {
    return getNotificationSupport().message;
  }

  isMasterEnabled(): boolean {
    return this.masterEnabled();
  }

  setMasterEnabled(enabled: boolean): boolean {
    if (!this.pro.unlocked()) {
      this.notice.set('Device reminders are a Pro feature.');
      return false;
    }
    this.notice.set(null);
    this.masterEnabled.set(enabled);
    writeStoredJson(MASTER_KEY, enabled);
    this.reschedule(this.store.tasks());
    return true;
  }

  async enableMasterWithPermission(): Promise<boolean> {
    if (!this.pro.unlocked()) {
      this.notice.set('Device reminders are a Pro feature.');
      return false;
    }

    const support = getNotificationSupport();
    if (support.status === 'ios-needs-install' || support.status === 'unsupported') {
      this.notice.set(support.message);
      return false;
    }
    if (support.status === 'denied') {
      this.notice.set(support.message);
      return false;
    }

    if (support.status !== 'granted') {
      const granted = await this.ensurePermission();
      if (!granted) {
        this.notice.set(getNotificationSupport().message ?? 'Notification permission was not granted.');
        return false;
      }
    }

    this.notice.set(null);
    this.setMasterEnabled(true);
    return true;
  }

  getConfig(taskId: number): TaskReminderConfig | null {
    return this.settings.get(taskId) ?? null;
  }

  isEnabled(taskId: number): boolean {
    this.settingsRevision();
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
    if (!this.pro.unlocked()) return false;
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
    this.markSettingsChanged();
    this.clearFiredForTask(taskId);
    this.persistSettings();
    this.reschedule(this.store.tasks());
    return true;
  }

  async toggleEnabled(task: Task): Promise<'opened' | 'disabled' | 'blocked'> {
    if (!this.pro.unlocked()) return 'blocked';
    if (!this.masterEnabled()) return 'blocked';

    const config = this.settings.get(task.id);
    if (config?.enabled) {
      this.settings.set(task.id, { ...config, enabled: false });
      this.markSettingsChanged();
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
    this.markSettingsChanged();
    this.clearFiredForTask(task.id);
    this.persistSettings();
    this.reschedule(this.store.tasks());
    return 'disabled';
  }

  async ensurePermission(): Promise<boolean> {
    const support = getNotificationSupport();
    if (support.status === 'ios-needs-install' || support.status === 'unsupported') return false;
    if (support.status === 'denied') return false;
    if (support.status === 'granted') return true;
    if (!hasNotificationApi()) return false;
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
        if (this.firingKeys.has(firedKey)) continue;
        this.firingKeys.add(firedKey);
        void this.fireReminder(task, config).then(delivered => {
          this.firingKeys.delete(firedKey);
          if (!delivered) return;
          this.firedKeys.add(firedKey);
          this.persistFired();
        });
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

  private async fireReminder(task: Task, config: TaskReminderConfig): Promise<boolean> {
    if (!this.pro.unlocked()) return false;
    if (!hasNotificationApi()) return false;
    if (Notification.permission !== 'granted') return false;

    const when = formatReminderWhen(config);
    const options: NotificationOptions = {
      body: `${task.title} · ${when}`,
      icon: '/favicon.svg',
      tag: firedKeyFor(task.id, config),
    };

    try {
      const registration = await this.notificationRegistration();
      if (registration) {
        await registration.showNotification('Task reminder', options);
        return true;
      }
    } catch {
      // Fall through to the page-level Notification constructor.
    }

    try {
      new Notification('Task reminder', options);
      return true;
    } catch {
      return false;
    }
  }

  private async notificationRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    try {
      const existing = await navigator.serviceWorker.getRegistration();
      if (existing && 'showNotification' in existing) return existing;

      const ready = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>(resolve => window.setTimeout(() => resolve(null), 5000)),
      ]);
      return ready && 'showNotification' in ready ? ready : null;
    } catch {
      return null;
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

  private markSettingsChanged(): void {
    this.settingsRevision.update(value => value + 1);
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
