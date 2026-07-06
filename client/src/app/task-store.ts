import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';
import { parseQuickAdd } from './task-quick-parse';
import { normalizeProject, coachPlanProject } from './task-domains';
import { nextRecurrenceDue, normalizeRecurrence, RecurrenceRule } from './task-recurrence';

export type Priority = 'none' | 'low' | 'medium' | 'high';

export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: number;
  title: string;
  done: boolean;
  pending?: boolean;
  sortOrder: number;
  priority: Priority;
  due: string | null;
  estimateMinutes: number | null;
  project: string | null;
  recurrence: RecurrenceRule | null;
  checklist: ChecklistItem[];
}

/** @deprecated Use Task — planning fields now live on the task itself. */
export type EnrichedTask = Task;

interface LegacyTaskMeta {
  priority: Priority;
  due: string | null;
  estimateMinutes: number | null;
}

const ESTIMATE_CYCLE = [null, 15, 30, 60, 120] as const;
const DEFAULT_ESTIMATE_WHEN_SCHEDULED = 15;
const DEFAULT_DAY_CAPACITY_MINUTES = 480;

const PRIORITY_CYCLE: Priority[] = ['none', 'low', 'medium', 'high'];

function priorityRank(priority: Priority): number {
  return PRIORITY_CYCLE.indexOf(priority);
}

export function dateToIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function todayIso(): string {
  return dateToIso(new Date());
}

/** Count open work items for a day — checklist items count individually. */
export function countOpenDayTasks(tasks: Task[]): number {
  return tasks.reduce((sum, task) => {
    if (task.done) return sum;
    if (task.checklist.length > 0) {
      const openItems = task.checklist.filter(item => !item.done).length;
      return sum + openItems;
    }
    return sum + 1;
  }, 0);
}

/** Count completed work items for a day — checklist items count individually. */
export function countCompletedDayTasks(tasks: Task[]): number {
  return tasks.reduce((sum, task) => {
    if (task.checklist.length > 0) {
      return sum + task.checklist.filter(item => item.done).length;
    }
    return sum + (task.done ? 1 : 0);
  }, 0);
}

export function offsetDateIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateToIso(date);
}

export function tomorrowIso(): string {
  return offsetDateIso(1);
}

export interface WeekGlanceDay {
  iso: string;
  weekday: string;
  day: number;
  count: number;
  isToday: boolean;
}

interface AppConfig {
  tasksApiUrl?: string;
}

type SyncStatus = 'loading' | 'synced' | 'syncing' | 'offline' | 'error';

interface QueuedTaskChange {
  id: string;
  type: 'create' | 'update' | 'delete' | 'reorder';
  taskId: number;
  title?: string;
  done?: boolean;
  sortOrder?: number;
  priority?: Priority;
  due?: string | null;
  estimateMinutes?: number | null;
  project?: string | null;
  recurrence?: RecurrenceRule | null;
  checklist?: ChecklistItem[];
  sortOrders?: Array<{ taskId: number; sortOrder: number }>;
  createdAt: string;
}

const LOCAL_TASKS_API_URL = 'http://localhost:5226/api/tasks';
const SAME_ORIGIN_TASKS_API_URL = '/api/tasks';
const LOCAL_TASKS_STORAGE_KEY = 'ttf-offline-tasks-v1';
const SYNC_QUEUE_STORAGE_KEY = 'ttf-sync-queue-v1';
const TASK_META_STORAGE_KEY = 'ttf-task-meta-v1';
const DAY_CAPACITY_STORAGE_KEY = 'ttf-day-capacity-v1';

function defaultTasksApiUrl() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? LOCAL_TASKS_API_URL
    : SAME_ORIGIN_TASKS_API_URL;
}

function normalizeTasksApiUrl(tasksApiUrl?: string) {
  const trimmedUrl = tasksApiUrl?.trim();
  return trimmedUrl ? trimmedUrl.replace(/\/+$/, '') : defaultTasksApiUrl();
}

function normalizePriority(value: unknown): Priority {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return 'none';
}

function normalizeChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<ChecklistItem> => !!item && typeof item === 'object')
    .map(item => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
      title: typeof item.title === 'string' ? item.title.trim() : '',
      done: !!item.done,
    }))
    .filter(item => item.title.length > 0);
}

function normalizeTask(raw: Partial<Task> & Pick<Task, 'id' | 'title' | 'done'>): Task {
  return {
    id: raw.id,
    title: raw.title,
    done: raw.done,
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : raw.id,
    priority: normalizePriority(raw.priority),
    due: raw.due ?? null,
    estimateMinutes: raw.estimateMinutes ?? null,
    project: normalizeProject(raw.project),
    recurrence: normalizeRecurrence(raw.recurrence),
    checklist: normalizeChecklist(raw.checklist),
  };
}

function compareTaskOrder(a: Task, b: Task): number {
  return a.sortOrder - b.sortOrder || a.id - b.id;
}

function stripFlags(task: Task): Task {
  return normalizeTask(task);
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

function taskPayload(task: Task) {
  return {
    title: task.title,
    done: task.done,
    priority: task.priority,
    due: task.due,
    estimateMinutes: task.estimateMinutes,
    project: task.project,
    recurrence: task.recurrence,
    checklist: task.checklist,
  };
}

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private http = inject(HttpClient);
  private tasksApiUrl = defaultTasksApiUrl();
  private queuedChanges: QueuedTaskChange[] = [];
  private syncInProgress = false;
  private syncRequested = false;

  tasks = signal<Task[]>([]);
  searchQuery = signal('');
  projectFilter = signal<string | null>(null);
  dayCapacityMinutes = signal(readStoredJson<number>(DAY_CAPACITY_STORAGE_KEY, DEFAULT_DAY_CAPACITY_MINUTES));
  syncStatus = signal<SyncStatus>('loading');
  pendingChanges = signal(0);

  remaining = computed(() => this.tasks().filter(task => !task.done).length);
  completedTasks = computed(() => this.tasks().filter(task => task.done));
  activeTasks = computed(() => this.tasks().filter(task => !task.done));
  activeEnrichedTasks = computed(() => this.enrichedTasks().filter(task => !task.done));
  completedEnrichedTasks = computed(() => this.enrichedTasks().filter(task => task.done));

  /** Tasks in the user's manual list order. */
  manualOrderTasks = computed<Task[]>(() =>
    this.tasks()
      .map(stripFlags)
      .sort(compareTaskOrder)
  );

  /** Tasks ordered by status, priority, then due date. */
  enrichedTasks = computed<Task[]>(() =>
    this.tasks()
      .map(stripFlags)
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        const byPriority = priorityRank(b.priority) - priorityRank(a.priority);
        if (byPriority !== 0) return byPriority;
        if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
        if (a.due && !b.due) return -1;
        if (!a.due && b.due) return 1;
        return a.id - b.id;
      })
  );

  /** Manual-order tasks filtered by search query and optional project. */
  filteredManualOrderTasks = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const project = this.projectFilter();

    return this.manualOrderTasks().filter(task => {
      if (project && task.project !== project) return false;
      if (!query) return true;

      const haystack = [
        task.title,
        task.project ?? '',
        ...(task.checklist.map(item => item.title)),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  });

  /** Tasks filtered by search query and optional project. */
  filteredEnrichedTasks = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const project = this.projectFilter();

    return this.enrichedTasks().filter(task => {
      if (project && task.project !== project) return false;
      if (!query) return true;

      const haystack = [
        task.title,
        task.project ?? '',
        ...(task.checklist.map(item => item.title)),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  });

  projectOptions = computed(() => {
    const values = new Set<string>();
    for (const task of this.tasks()) {
      if (task.project) values.add(task.project);
    }
    return [...values].sort();
  });

  completedDueTodayCount = computed(() => {
    const today = todayIso();
    return countCompletedDayTasks(this.tasks().filter(task => task.due === today));
  });

  incompleteDueTodayCount = computed(() => countOpenDayTasks(this.dueTodayTasks()));

  openDueTodayCount = computed(() => countOpenDayTasks(this.dueTodayTasks()));

  tomorrowTaskCount = computed(() => {
    const tomorrow = tomorrowIso();
    const tasks = this.enrichedTasks().filter(task => task.due === tomorrow);
    return countOpenDayTasks(tasks);
  });

  overdueTasks = computed(() => {
    const today = todayIso();
    return this.enrichedTasks().filter(task => !task.done && task.due !== null && task.due < today);
  });

  dueTodayTasks = computed(() => {
    const today = todayIso();
    return this.enrichedTasks().filter(task => !task.done && task.due === today);
  });

  upcomingTasks = computed(() => {
    const today = todayIso();
    return this.enrichedTasks().filter(task => !task.done && task.due !== null && task.due > today);
  });

  scheduledCount = computed(() =>
    this.overdueTasks().length + this.dueTodayTasks().length + this.upcomingTasks().length
  );

  todayFocusTasks = computed(() => [...this.overdueTasks(), ...this.dueTodayTasks()]);

  todayEstimatedMinutes = computed(() =>
    this.todayFocusTasks().reduce((sum, task) => sum + this.effectiveEstimate(task), 0)
  );

  todayCapacityPercent = computed(() => {
    const cap = this.dayCapacityMinutes();
    if (cap <= 0) return 0;
    return Math.min(100, Math.round((this.todayEstimatedMinutes() / cap) * 100));
  });

  isOvercommitted = computed(() => this.todayEstimatedMinutes() > this.dayCapacityMinutes());

  todayEstimatedLabel = computed(() => formatMinutes(this.todayEstimatedMinutes()));

  dayCapacityLabel = computed(() => formatMinutes(this.dayCapacityMinutes()));

  tasksByDueDate = computed(() => {
    const map: Record<string, Task[]> = {};
    for (const task of this.enrichedTasks()) {
      if (!task.due) continue;
      (map[task.due] ??= []).push(task);
    }
    return map;
  });

  unscheduledActiveTasks = computed(() =>
    this.enrichedTasks().filter(task => !task.done && !task.due)
  );

  weekGlance = computed<WeekGlanceDay[]>(() => {
    const today = todayIso();
    const byDate = this.tasksByDueDate();
    const days: WeekGlanceDay[] = [];

    for (let offset = 0; offset < 7; offset++) {
      const iso = offsetDateIso(offset);
      const date = new Date(iso + 'T00:00:00');
      days.push({
        iso,
        weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
        day: date.getDate(),
        count: countOpenDayTasks(byDate[iso] ?? []),
        isToday: iso === today,
      });
    }

    return days;
  });

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

  /** Best-effort sync before an app reload so tasks survive a refresh. */
  async prepareForAppRefresh(maxWaitMs = 5000): Promise<void> {
    this.setLocalTasks(this.tasks().map(stripFlags));
    await Promise.race([
      this.syncNow(),
      new Promise<void>(resolve => setTimeout(resolve, maxWaitMs)),
    ]);
  }

  reorderTasks(previousIndex: number, currentIndex: number) {
    if (previousIndex === currentIndex) return;

    const visibleTasks = this.filteredManualOrderTasks();
    const reorderedVisible = [...visibleTasks];
    const [moved] = reorderedVisible.splice(previousIndex, 1);
    reorderedVisible.splice(currentIndex, 0, moved);

    const orderMap = new Map(
      reorderedVisible.map((task, index) => [task.id, (index + 1) * 10])
    );

    const updated = this.tasks().map(task => {
      const stripped = stripFlags(task);
      return orderMap.has(task.id)
        ? { ...stripped, sortOrder: orderMap.get(task.id)! }
        : stripped;
    });

    this.setLocalTasks(updated);
    this.queueReorder(
      [...orderMap.entries()].map(([taskId, sortOrder]) => ({ taskId, sortOrder }))
    );
    void this.syncNow();
  }

  addTask(raw: string) {
    const parsed = parseQuickAdd(raw);
    if (parsed.title === '') return;

    const task: Task = {
      id: this.nextLocalId(),
      title: parsed.title,
      done: false,
      pending: true,
      sortOrder: this.nextSortOrder(),
      priority: parsed.priority,
      due: parsed.due,
      estimateMinutes: parsed.estimateMinutes,
      project: parsed.project,
      recurrence: parsed.recurrence,
      checklist: [],
    };

    this.setLocalTasks([...this.tasks().map(stripFlags), task]);
    this.enqueueChange({
      id: crypto.randomUUID(),
      type: 'create',
      taskId: task.id,
      title: task.title,
      done: task.done,
      priority: task.priority,
      due: task.due,
      estimateMinutes: task.estimateMinutes,
      project: task.project,
      recurrence: task.recurrence,
      checklist: task.checklist,
      createdAt: new Date().toISOString()
    });
    void this.syncNow();
  }

  addTaskOnDate(raw: string, dueIso: string) {
    const parsed = parseQuickAdd(raw);
    if (parsed.title === '') return;

    const task: Task = {
      id: this.nextLocalId(),
      title: parsed.title,
      done: false,
      pending: true,
      sortOrder: this.nextSortOrder(),
      priority: parsed.priority,
      due: dueIso,
      estimateMinutes: parsed.estimateMinutes,
      project: parsed.project,
      recurrence: parsed.recurrence,
      checklist: [],
    };

    this.setLocalTasks([...this.tasks().map(stripFlags), task]);
    this.enqueueChange({
      id: crypto.randomUUID(),
      type: 'create',
      taskId: task.id,
      title: task.title,
      done: task.done,
      priority: task.priority,
      due: task.due,
      estimateMinutes: task.estimateMinutes,
      project: task.project,
      recurrence: task.recurrence,
      checklist: task.checklist,
      createdAt: new Date().toISOString()
    });
    void this.syncNow();
  }

  scheduleToDay(id: number, dueIso: string) {
    this.setDue(id, dueIso);
  }

  toggleTask(id: number) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;

    const nextDone = !task.done;
    const checklist = task.checklist.length
      ? task.checklist.map(item => ({ ...item, done: nextDone }))
      : task.checklist;
    const updatedTask = normalizeTask({ ...stripFlags(task), done: nextDone, checklist });
    this.updateLocalTask(updatedTask);
    this.queueTaskUpdate(updatedTask);

    if (nextDone && task.recurrence) {
      this.spawnRecurringNext(stripFlags(task));
    }

    void this.syncNow();
  }

  toggleChecklistItem(taskId: number, itemId: string) {
    const task = this.tasks().find(t => t.id === taskId);
    if (!task || task.checklist.length === 0) return;

    const checklist = task.checklist.map(item =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    const allDone = checklist.every(item => item.done);
    const updatedTask = normalizeTask({ ...stripFlags(task), checklist, done: allDone });
    this.updateLocalTask(updatedTask);
    this.queueTaskUpdate(updatedTask);
    if (allDone && task.recurrence) {
      this.spawnRecurringNext(stripFlags(task));
    }

    void this.syncNow();
  }

  editTask(id: number, newTitle: string) {
    const task = this.tasks().find(t => t.id === id);
    const trimmedTitle = newTitle.trim();
    if (!task || trimmedTitle === '') return;

    const updatedTask = { ...stripFlags(task), title: trimmedTitle };
    this.updateLocalTask(updatedTask);
    this.queueTaskUpdate(updatedTask);
    void this.syncNow();
  }

  removeTask(id: number) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;

    this.setLocalTasks(this.tasks().filter(t => t.id !== id).map(stripFlags));
    this.queueTaskDelete(stripFlags(task));
    void this.syncNow();
  }

  clearTasks() {
    const currentTasks = this.tasks().map(stripFlags);
    this.setLocalTasks([]);
    this.queueTaskDeletes(currentTasks);
    void this.syncNow();
  }

  cyclePriority(id: number) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;
    const next = PRIORITY_CYCLE[(priorityRank(task.priority) + 1) % PRIORITY_CYCLE.length];
    this.updatePlanningFields(id, { priority: next });
  }

  setPriority(id: number, priority: Priority) {
    this.updatePlanningFields(id, { priority });
  }

  setDue(id: number, due: string | null) {
    this.updatePlanningFields(id, { due: due || null });
  }

  cycleEstimate(id: number) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;
    const idx = ESTIMATE_CYCLE.indexOf(task.estimateMinutes as typeof ESTIMATE_CYCLE[number]);
    const next = ESTIMATE_CYCLE[(idx + 1) % ESTIMATE_CYCLE.length];
    this.updatePlanningFields(id, { estimateMinutes: next });
  }

  setEstimateMinutes(id: number, estimateMinutes: number | null) {
    this.updatePlanningFields(id, { estimateMinutes });
  }

  updateTask(id: number, patch: Partial<Pick<Task, 'title' | 'priority' | 'due' | 'estimateMinutes' | 'done' | 'checklist' | 'project' | 'recurrence'>>) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;

    if (patch.title !== undefined && patch.title.trim() === '') return;

    const updatedTask = normalizeTask({
      ...stripFlags(task),
      ...patch,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    });

    this.updateLocalTask(updatedTask);
    this.queueTaskUpdate(updatedTask);
    void this.syncNow();
  }

  setDayCapacityHours(hours: number) {
    const minutes = Math.max(1, Math.round(hours * 60));
    this.dayCapacityMinutes.set(minutes);
    writeStoredJson(DAY_CAPACITY_STORAGE_KEY, minutes);
  }

  postponeToTomorrow(id: number) {
    this.setDue(id, tomorrowIso());
  }

  /** Move lowest-priority due-today tasks to tomorrow until the day fits capacity. */
  lightenToday(): number {
    let moved = 0;

    while (this.isOvercommitted()) {
      const candidates = this.dueTodayTasks()
        .filter(task => !task.done)
        .sort((a, b) => {
          const byPriority = priorityRank(a.priority) - priorityRank(b.priority);
          if (byPriority !== 0) return byPriority;
          return (b.estimateMinutes ?? 0) - (a.estimateMinutes ?? 0);
        });

      const task = candidates[0];
      if (!task) break;

      this.setDue(task.id, tomorrowIso());
      moved++;
    }

    return moved;
  }

  rollOverdueToToday() {
    const today = todayIso();
    for (const task of this.overdueTasks()) {
      this.setDue(task.id, today);
    }
  }

  /** Move incomplete due-today tasks to another date. */
  rescheduleIncompleteDueToday(toIso: string): number {
    let moved = 0;
    for (const task of this.dueTodayTasks()) {
      if (task.done) continue;
      this.setDue(task.id, toIso);
      moved++;
    }
    return moved;
  }

  setSearchQuery(query: string) {
    this.searchQuery.set(query);
  }

  setProjectFilter(project: string | null) {
    this.projectFilter.set(project);
  }

  applySchedule(
    assignments: Array<{
      taskId?: number | null;
      due: string;
      title?: string;
      estimateMinutes?: number | null;
      checklist?: Array<{ id?: string; title: string; done?: boolean }>;
    }>,
    planLabel?: string | null
  ): number {
    const planProject = planLabel?.trim() ? coachPlanProject(planLabel) : null;
    let applied = 0;
    for (const assignment of assignments) {
      const checklist = normalizeChecklist(assignment.checklist);

      if (assignment.taskId != null) {
        const task = this.tasks().find(item => item.id === assignment.taskId);
        if (!task || task.done) continue;
        const updatedTask = normalizeTask({
          ...stripFlags(task),
          due: assignment.due,
          ...(planProject ? { project: planProject } : {}),
          ...(checklist.length > 0 ? { checklist } : {}),
        });
        this.updateLocalTask(updatedTask);
        this.queueTaskUpdate(updatedTask);
        applied++;
        continue;
      }

      const title = assignment.title?.trim();
      if (!title) continue;

      const task: Task = {
        id: this.nextLocalId(),
        title,
        done: false,
        pending: true,
        sortOrder: this.nextSortOrder(),
        priority: 'none',
        due: assignment.due,
        estimateMinutes: assignment.estimateMinutes ?? null,
        project: planProject,
        recurrence: null,
        checklist,
      };

      this.setLocalTasks([...this.tasks().map(stripFlags), task]);
      this.enqueueChange({
        id: crypto.randomUUID(),
        type: 'create',
        taskId: task.id,
        title: task.title,
        done: task.done,
        priority: task.priority,
        due: task.due,
        estimateMinutes: task.estimateMinutes,
        project: task.project,
        recurrence: task.recurrence,
        checklist: task.checklist,
        createdAt: new Date().toISOString(),
      });
      applied++;
    }

    if (applied > 0) void this.syncNow();
    return applied;
  }

  private updatePlanningFields(id: number, patch: Partial<Pick<Task, 'priority' | 'due' | 'estimateMinutes'>>) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;

    const updatedTask = { ...stripFlags(task), ...patch };
    this.updateLocalTask(updatedTask);
    this.queueTaskUpdate(updatedTask);
    void this.syncNow();
  }

  private effectiveEstimate(task: Task): number {
    if (task.estimateMinutes !== null) return task.estimateMinutes;
    if (task.due) return DEFAULT_ESTIMATE_WHEN_SCHEDULED;
    return 0;
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
    const stored = readStoredJson<Partial<Task>[]>(LOCAL_TASKS_STORAGE_KEY, []);
    this.tasks.set(this.withPendingFlags(stored.map(task => normalizeTask({
      id: task.id!,
      title: task.title ?? '',
      done: task.done ?? false,
      sortOrder: task.sortOrder,
      priority: task.priority,
      due: task.due,
      estimateMinutes: task.estimateMinutes,
      project: task.project,
      recurrence: task.recurrence,
      checklist: task.checklist,
    }))));
    this.migrateLegacyMeta();
    this.syncStatus.set(this.isOnline() ? 'loading' : 'offline');
  }

  private migrateLegacyMeta() {
    const legacy = readStoredJson<Record<string, LegacyTaskMeta>>(TASK_META_STORAGE_KEY, {});
    if (Object.keys(legacy).length === 0) return;

    let changed = false;
    const updated = this.tasks().map(task => {
      const meta = legacy[String(task.id)];
      if (!meta) return stripFlags(task);
      changed = true;
      return normalizeTask({
        ...stripFlags(task),
        priority: meta.priority,
        due: meta.due,
        estimateMinutes: meta.estimateMinutes,
      });
    });

    if (!changed) {
      writeStoredJson(TASK_META_STORAGE_KEY, {});
      return;
    }

    this.setLocalTasks(updated);
    for (const task of updated) {
      if (legacy[String(task.id)] && task.id > 0) {
        this.queueTaskUpdate(task);
      }
    }
    writeStoredJson(TASK_META_STORAGE_KEY, {});
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
          const remoteTasks = await firstValueFrom(this.http.get<Partial<Task>[]>(this.tasksApiUrl));

          if (this.queuedChanges.length === 0) {
            this.setLocalTasks(remoteTasks.map(task => normalizeTask({
              id: task.id!,
              title: task.title ?? '',
              done: task.done ?? false,
              sortOrder: task.sortOrder,
              priority: task.priority,
              due: task.due,
              estimateMinutes: task.estimateMinutes,
              project: task.project,
              recurrence: task.recurrence,
              checklist: task.checklist,
            })));
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
    if (change.type === 'reorder') {
      await firstValueFrom(this.http.patch(`${this.tasksApiUrl}/reorder`, {
        tasks: (change.sortOrders ?? []).map(item => ({
          id: item.taskId,
          sortOrder: item.sortOrder,
        })),
      }));
      return;
    }

    if (change.type === 'create') {
      const createdTask = await firstValueFrom(this.http.post<Partial<Task>>(this.tasksApiUrl, {
        title: change.title,
        priority: change.priority ?? 'none',
        due: change.due ?? null,
        estimateMinutes: change.estimateMinutes ?? null,
        project: change.project ?? null,
        recurrence: change.recurrence ?? null,
        checklist: change.checklist ?? [],
      }));
      const normalized = normalizeTask({
        id: createdTask.id!,
        title: createdTask.title ?? change.title ?? '',
        done: createdTask.done ?? false,
        sortOrder: createdTask.sortOrder ?? change.sortOrder,
        priority: createdTask.priority ?? change.priority,
        due: createdTask.due ?? change.due ?? null,
        estimateMinutes: createdTask.estimateMinutes ?? change.estimateMinutes ?? null,
        project: createdTask.project ?? change.project ?? null,
        recurrence: createdTask.recurrence ?? change.recurrence ?? null,
        checklist: createdTask.checklist ?? change.checklist,
      });

      let syncedTask = normalized;
      if (change.done) {
        const doneResponse = await firstValueFrom(this.http.put<Partial<Task>>(`${this.tasksApiUrl}/${normalized.id}`, {
          ...taskPayload({ ...normalized, done: true }),
        }));
        syncedTask = normalizeTask({
          id: doneResponse.id ?? normalized.id,
          title: doneResponse.title ?? normalized.title,
          done: doneResponse.done ?? true,
          sortOrder: doneResponse.sortOrder ?? normalized.sortOrder,
          priority: doneResponse.priority ?? normalized.priority,
          due: doneResponse.due ?? normalized.due,
          estimateMinutes: doneResponse.estimateMinutes ?? normalized.estimateMinutes,
          project: doneResponse.project ?? normalized.project,
          recurrence: doneResponse.recurrence ?? normalized.recurrence,
          checklist: doneResponse.checklist ?? normalized.checklist,
        });
      }

      this.replaceLocalTaskId(change.taskId, syncedTask);
      return;
    }

    if (change.type === 'update') {
      const payload = {
        title: change.title,
        done: change.done,
        priority: change.priority ?? 'none',
        due: change.due ?? null,
        estimateMinutes: change.estimateMinutes ?? null,
        project: change.project ?? null,
        recurrence: change.recurrence ?? null,
        checklist: change.checklist ?? [],
      };

      try {
        const updatedTask = await firstValueFrom(this.http.put<Partial<Task>>(`${this.tasksApiUrl}/${change.taskId}`, payload));
        this.updateLocalTask(normalizeTask({
          id: updatedTask.id ?? change.taskId,
          title: updatedTask.title ?? change.title ?? '',
          done: updatedTask.done ?? change.done ?? false,
          sortOrder: updatedTask.sortOrder ?? change.sortOrder,
          priority: updatedTask.priority ?? change.priority,
          due: updatedTask.due ?? change.due ?? null,
          estimateMinutes: updatedTask.estimateMinutes ?? change.estimateMinutes ?? null,
          project: updatedTask.project ?? change.project ?? null,
          recurrence: updatedTask.recurrence ?? change.recurrence ?? null,
          checklist: updatedTask.checklist ?? change.checklist,
        }));
      } catch (error) {
        if (!this.isNotFound(error)) throw error;

        const recreatedTask = await firstValueFrom(this.http.post<Partial<Task>>(this.tasksApiUrl, {
          title: change.title,
          priority: change.priority ?? 'none',
          due: change.due ?? null,
          estimateMinutes: change.estimateMinutes ?? null,
          project: change.project ?? null,
          recurrence: change.recurrence ?? null,
          checklist: change.checklist ?? [],
        }));
        const normalized = normalizeTask({
          id: recreatedTask.id!,
          title: recreatedTask.title ?? change.title ?? '',
          done: recreatedTask.done ?? false,
          sortOrder: recreatedTask.sortOrder ?? change.sortOrder,
          priority: recreatedTask.priority ?? change.priority,
          due: recreatedTask.due ?? change.due ?? null,
          estimateMinutes: recreatedTask.estimateMinutes ?? change.estimateMinutes ?? null,
          project: recreatedTask.project ?? change.project ?? null,
          recurrence: recreatedTask.recurrence ?? change.recurrence ?? null,
          checklist: recreatedTask.checklist ?? change.checklist,
        });
        let syncedTask = normalized;
        if (change.done) {
          const doneResponse = await firstValueFrom(this.http.put<Partial<Task>>(`${this.tasksApiUrl}/${normalized.id}`, {
            ...taskPayload({ ...normalized, done: true }),
          }));
          syncedTask = normalizeTask({
            id: doneResponse.id ?? normalized.id,
            title: doneResponse.title ?? normalized.title,
            done: doneResponse.done ?? true,
            sortOrder: doneResponse.sortOrder ?? normalized.sortOrder,
            priority: doneResponse.priority ?? normalized.priority,
            due: doneResponse.due ?? normalized.due,
            estimateMinutes: doneResponse.estimateMinutes ?? normalized.estimateMinutes,
            project: doneResponse.project ?? normalized.project,
            recurrence: doneResponse.recurrence ?? normalized.recurrence,
            checklist: doneResponse.checklist ?? normalized.checklist,
          });
        }

        this.replaceLocalTaskId(change.taskId, syncedTask);
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
      createChange.priority = task.priority;
      createChange.due = task.due;
      createChange.estimateMinutes = task.estimateMinutes;
      createChange.project = task.project;
      createChange.recurrence = task.recurrence;
      createChange.checklist = task.checklist;
      this.persistQueue();
      return;
    }

    if (this.queuedChanges.some(change => change.type === 'delete' && change.taskId === task.id)) return;

    const updateChange = this.queuedChanges.find(change => change.type === 'update' && change.taskId === task.id);
    if (updateChange) {
      updateChange.title = task.title;
      updateChange.done = task.done;
      updateChange.priority = task.priority;
      updateChange.due = task.due;
      updateChange.estimateMinutes = task.estimateMinutes;
      updateChange.project = task.project;
      updateChange.recurrence = task.recurrence;
      updateChange.checklist = task.checklist;
      this.persistQueue();
      return;
    }

    this.enqueueChange({
      id: crypto.randomUUID(),
      type: 'update',
      taskId: task.id,
      title: task.title,
      done: task.done,
      priority: task.priority,
      due: task.due,
      estimateMinutes: task.estimateMinutes,
      project: task.project,
      recurrence: task.recurrence,
      checklist: task.checklist,
      createdAt: new Date().toISOString()
    });
  }

  private spawnRecurringNext(completed: Task) {
    if (!completed.recurrence) return;

    const nextDue = nextRecurrenceDue(completed.recurrence, completed.due, todayIso());
    const checklist = completed.checklist.map(item => ({ ...item, done: false }));

    const task: Task = {
      id: this.nextLocalId(),
      title: completed.title,
      done: false,
      pending: true,
      sortOrder: this.nextSortOrder(),
      priority: completed.priority,
      due: nextDue,
      estimateMinutes: completed.estimateMinutes,
      project: completed.project,
      recurrence: completed.recurrence,
      checklist,
    };

    this.setLocalTasks([...this.tasks().map(stripFlags), task]);
    this.enqueueChange({
      id: crypto.randomUUID(),
      type: 'create',
      taskId: task.id,
      title: task.title,
      done: task.done,
      priority: task.priority,
      due: task.due,
      estimateMinutes: task.estimateMinutes,
      project: task.project,
      recurrence: task.recurrence,
      checklist: task.checklist,
      createdAt: new Date().toISOString(),
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
      currentTask.id === task.id ? task : stripFlags(currentTask)
    ));
  }

  private replaceLocalTaskId(localId: number, serverTask: Task) {
    this.setLocalTasks(this.tasks().map(task =>
      task.id === localId ? serverTask : stripFlags(task)
    ));
  }

  private queueReorder(sortOrders: Array<{ taskId: number; sortOrder: number }>) {
    this.queuedChanges = this.queuedChanges.filter(change => change.type !== 'reorder');
    this.enqueueChange({
      id: crypto.randomUUID(),
      type: 'reorder',
      taskId: -1,
      sortOrders,
      createdAt: new Date().toISOString(),
    });
  }

  private nextSortOrder() {
    const maxSortOrder = this.tasks().reduce(
      (max, task) => Math.max(max, stripFlags(task).sortOrder),
      0
    );
    return maxSortOrder + 10;
  }

  private setLocalTasks(tasks: Task[]) {
    const sortedTasks = tasks
      .map(stripFlags)
      .sort(compareTaskOrder);

    this.tasks.set(this.withPendingFlags(sortedTasks));
    writeStoredJson(LOCAL_TASKS_STORAGE_KEY, sortedTasks);
  }

  private persistQueue() {
    this.pendingChanges.set(this.queuedChanges.length);
    writeStoredJson(SYNC_QUEUE_STORAGE_KEY, this.queuedChanges);
    this.tasks.set(this.withPendingFlags(this.tasks().map(stripFlags)));
  }

  private withPendingFlags(tasks: Task[]) {
    const pendingTaskIds = new Set(this.queuedChanges.map(change => change.taskId));
    return tasks.map(task => ({ ...stripFlags(task), pending: pendingTaskIds.has(task.id) }));
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

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
