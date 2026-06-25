import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ProUpgrade } from '../pro-upgrade/pro-upgrade';
import { ProService } from '../pro.service';
import { TaskDetailsOverlayService } from '../task-details-overlay.service';
import { TaskItem } from '../task-item/task-item';
import { dateToIso, Task, TaskStore } from '../task-store';

export interface CalendarCell {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  tasks: Task[];
  openCount: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DRAG_TASK_ID = 'application/x-ttf-task-id';

type ViewMode = 'month' | 'week';

function buildMonthCells(year: number, month: number, byDate: Record<string, Task[]>): CalendarCell[] {
  const today = dateToIso(new Date());
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const cells: CalendarCell[] = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push(makeCell(date, date.getMonth() === month, today, byDate));
  }

  return cells;
}

function buildWeekCells(anchorIso: string, byDate: Record<string, Task[]>): CalendarCell[] {
  const today = dateToIso(new Date());
  const anchor = new Date(anchorIso + 'T00:00:00');
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  const cells: CalendarCell[] = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push(makeCell(date, true, today, byDate));
  }

  return cells;
}

function makeCell(date: Date, inMonth: boolean, today: string, byDate: Record<string, Task[]>): CalendarCell {
  const iso = dateToIso(date);
  const tasks = byDate[iso] ?? [];
  return {
    iso,
    day: date.getDate(),
    inMonth,
    isToday: iso === today,
    tasks,
    openCount: tasks.filter(t => !t.done).length,
  };
}

function weekLabel(cells: CalendarCell[]): string {
  if (!cells.length) return '';
  const start = new Date(cells[0].iso + 'T00:00:00');
  const end = new Date(cells[cells.length - 1].iso + 'T00:00:00');
  const sameMonth = start.getMonth() === end.getMonth();
  const startFmt = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endFmt = end.toLocaleDateString(undefined, sameMonth
    ? { day: 'numeric' }
    : { month: 'short', day: 'numeric' });
  const year = end.getFullYear();
  return `${startFmt} – ${endFmt}, ${year}`;
}

@Component({
  selector: 'app-calendar',
  imports: [TaskItem, ProUpgrade],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
})
export class Calendar {
  store = inject(TaskStore);
  protected pro = inject(ProService);
  private route = inject(ActivatedRoute);
  private detailsOverlay = inject(TaskDetailsOverlayService);

  protected readonly weekdays = WEEKDAYS;
  protected readonly dragTaskId = DRAG_TASK_ID;

  protected viewMode = signal<ViewMode>('month');
  protected viewYear = signal(new Date().getFullYear());
  protected viewMonth = signal(new Date().getMonth());
  protected selectedDay = signal(dateToIso(new Date()));
  protected dragOverDay = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap.subscribe(params => {
      const day = params.get('day');
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      this.selectDay(day);
      this.viewMode.set('week');
    });
  }

  protected periodLabel = computed(() => {
    if (this.viewMode() === 'week') {
      return weekLabel(this.weekCells());
    }
    return new Date(this.viewYear(), this.viewMonth(), 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  });

  protected monthCells = computed(() =>
    buildMonthCells(this.viewYear(), this.viewMonth(), this.store.tasksByDueDate())
  );

  protected weekCells = computed(() =>
    buildWeekCells(this.selectedDay(), this.store.tasksByDueDate())
  );

  protected gridCells = computed(() =>
    this.viewMode() === 'week' ? this.weekCells() : this.monthCells()
  );

  protected selectedTasks = computed(() => {
    const day = this.selectedDay();
    return day ? (this.store.tasksByDueDate()[day] ?? []) : [];
  });

  protected selectedLabel = computed(() => {
    const day = this.selectedDay();
    if (!day) return '';
    const date = new Date(day + 'T00:00:00');
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  });

  protected setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  protected prevPeriod(): void {
    if (this.viewMode() === 'week') {
      this.shiftSelectedDay(-7);
      return;
    }
    this.prevMonth();
  }

  protected nextPeriod(): void {
    if (this.viewMode() === 'week') {
      this.shiftSelectedDay(7);
      return;
    }
    this.nextMonth();
  }

  protected prevMonth(): void {
    const m = this.viewMonth();
    const y = this.viewYear();
    if (m === 0) {
      this.viewMonth.set(11);
      this.viewYear.set(y - 1);
    } else {
      this.viewMonth.set(m - 1);
    }
  }

  protected nextMonth(): void {
    const m = this.viewMonth();
    const y = this.viewYear();
    if (m === 11) {
      this.viewMonth.set(0);
      this.viewYear.set(y + 1);
    } else {
      this.viewMonth.set(m + 1);
    }
  }

  protected goToday(): void {
    const now = new Date();
    this.viewYear.set(now.getFullYear());
    this.viewMonth.set(now.getMonth());
    this.selectedDay.set(dateToIso(now));
  }

  protected selectDay(iso: string): void {
    this.selectedDay.set(iso);
    const [y, m] = iso.split('-').map(Number);
    this.viewYear.set(y);
    this.viewMonth.set(m - 1);
  }

  protected onDayCellClick(iso: string, tasks: Task[]): void {
    this.selectDay(iso);
    const detailTask = this.pickDetailsTask(tasks);
    if (detailTask) {
      this.detailsOverlay.open(detailTask);
    }
  }

  protected hasDetailsTask(tasks: Task[]): boolean {
    return tasks.some(task => task.checklist.length > 0);
  }

  protected openTaskFromCalendar(event: Event, task: Task): void {
    event.stopPropagation();
    this.selectDay(task.due!);
    if (task.checklist.length > 0) {
      this.detailsOverlay.open(task);
    }
  }

  private pickDetailsTask(tasks: Task[]): Task | null {
    const withChecklist = tasks.filter(task => task.checklist.length > 0);
    if (withChecklist.length === 0) return null;
    return withChecklist.find(task => !task.done) ?? withChecklist[0];
  }

  protected addOnSelected(input: HTMLInputElement): void {
    const day = this.selectedDay();
    if (!day) return;
    this.store.addTaskOnDate(input.value, day);
    input.value = '';
  }

  protected scheduleTask(id: number): void {
    const day = this.selectedDay();
    if (day) this.store.scheduleToDay(id, day);
  }

  protected onDragStart(event: DragEvent, taskId: number): void {
    event.dataTransfer?.setData(DRAG_TASK_ID, String(taskId));
    event.dataTransfer!.effectAllowed = 'move';
  }

  protected onDragOver(event: DragEvent, iso: string): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    this.dragOverDay.set(iso);
  }

  protected onDragLeave(iso: string): void {
    if (this.dragOverDay() === iso) {
      this.dragOverDay.set(null);
    }
  }

  protected onDrop(event: DragEvent, iso: string): void {
    event.preventDefault();
    this.dragOverDay.set(null);
    const raw = event.dataTransfer?.getData(DRAG_TASK_ID);
    const taskId = raw ? Number(raw) : NaN;
    if (!Number.isFinite(taskId)) return;
    this.store.scheduleToDay(taskId, iso);
    this.selectDay(iso);
  }

  private shiftSelectedDay(days: number): void {
    const current = new Date(this.selectedDay() + 'T00:00:00');
    current.setDate(current.getDate() + days);
    const iso = dateToIso(current);
    this.selectedDay.set(iso);
    this.viewYear.set(current.getFullYear());
    this.viewMonth.set(current.getMonth());
  }
}
