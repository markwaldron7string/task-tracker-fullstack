import { Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { injectOverlayDismissBinding } from '../overlay-dismiss.service';
import { TaskTimePicker } from '../task-time-picker/task-time-picker';
import {
  defaultCustomDays,
  defaultMonthDays,
  monthDayGridCells,
  RECURRENCE_OPTIONS,
  RecurrenceRule,
  WEEKDAY_LABELS,
} from '../task-recurrence';
import { TaskReminderService } from '../task-reminder.service';
import { EnrichedTask } from '../task-store';

export type RecurrencePopover = 'week' | 'month' | null;

export interface TaskReminderDialogSave {
  taskId: number;
  enabled: boolean;
  remindDate: string;
  remindTime: string;
  recurrence: RecurrenceRule | null;
  recurrenceDays: number[] | null;
  recurrenceMonthDays: number[] | null;
}

@Component({
  selector: 'app-task-reminder-dialog',
  imports: [TaskTimePicker],
  templateUrl: './task-reminder-dialog.html',
  styleUrl: './task-reminder-dialog.css',
})
export class TaskReminderDialog {
  private reminders = inject(TaskReminderService);
  private host = inject(ElementRef<HTMLElement>);

  task = input.required<EnrichedTask>();

  save = output<TaskReminderDialogSave>();
  cancel = output<void>();

  protected readonly recurrenceOptions = RECURRENCE_OPTIONS;
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly monthDayCells = monthDayGridCells();

  protected enabled = signal(true);
  protected remindDate = signal('');
  protected remindTime = signal('09:00');
  protected recurrence = signal<RecurrenceRule | null>(null);
  protected customDays = signal<number[]>([]);
  protected monthDays = signal<number[]>([]);
  protected recurrencePopover = signal<RecurrencePopover>(null);
  protected notice = signal<string | null>(null);

  protected popoverPanel = viewChild<ElementRef<HTMLElement>>('popoverPanel');

  protected permissionBlocked = computed(() => this.reminders.permissionState() === 'denied');
  protected permissionUnsupported = computed(() => this.reminders.permissionState() === 'unsupported');

  protected customActive = computed(() => {
    const rule = this.recurrence();
    return rule === 'custom' || rule === 'weekly';
  });

  constructor() {
    injectOverlayDismissBinding(() => ({
      contains: target => this.host.nativeElement.contains(target),
      close: () => this.cancel.emit(),
    }));

    injectOverlayDismissBinding(() => {
      const popover = this.recurrencePopover();
      const panel = this.popoverPanel()?.nativeElement;
      if (!popover || !panel) return null;
      return {
        contains: target => panel.contains(target),
        close: () => this.closeRecurrencePopover(),
      };
    });

    effect(() => {
      const task = this.task();
      const config = this.reminders.buildDefaultConfig(task);
      const rule = config.recurrence ?? task.recurrence;
      this.enabled.set(config.enabled || !this.reminders.getConfig(task.id));
      this.remindDate.set(config.remindDate);
      this.remindTime.set(config.remindTime);
      this.recurrence.set(rule === 'weekly' ? 'custom' : rule);
      this.customDays.set(
        config.recurrenceDays?.length
          ? [...config.recurrenceDays]
          : defaultCustomDays(config.remindDate ?? task.due)
      );
      this.monthDays.set(
        config.recurrenceMonthDays?.length
          ? [...config.recurrenceMonthDays]
          : defaultMonthDays(config.remindDate ?? task.due)
      );
      this.recurrencePopover.set(null);
      this.notice.set(null);
    });
  }

  protected onBackdropClick(): void {
    this.cancel.emit();
  }

  protected onDialogClick(event: Event): void {
    event.stopPropagation();
  }

  protected setRecurrence(value: RecurrenceRule | null): void {
    this.recurrence.set(value);
    if (value === 'custom') {
      if (!this.customDays().length) {
        this.customDays.set(defaultCustomDays(this.remindDate()));
      }
      this.recurrencePopover.set('week');
      return;
    }
    if (value === 'monthly') {
      if (!this.monthDays().length) {
        this.monthDays.set(defaultMonthDays(this.remindDate()));
      }
      this.recurrencePopover.set('month');
      return;
    }
    this.recurrencePopover.set(null);
  }

  protected isRecurrenceActive(value: RecurrenceRule | null): boolean {
    if (value === null) return this.recurrence() === null;
    if (value === 'custom') return this.customActive();
    return this.recurrence() === value;
  }

  protected toggleCustomDay(day: number): void {
    const current = this.customDays();
    const next = current.includes(day)
      ? current.filter(item => item !== day)
      : [...current, day].sort((a, b) => a - b);
    this.customDays.set(next);
    if (next.length === 0) {
      this.notice.set('Pick at least one day for a custom repeat.');
      return;
    }
    this.notice.set(null);
  }

  protected toggleMonthDay(day: number): void {
    const current = this.monthDays();
    const next = current.includes(day)
      ? current.filter(item => item !== day)
      : [...current, day].sort((a, b) => a - b);
    this.monthDays.set(next);
    if (next.length === 0) {
      this.notice.set('Pick at least one day of the month.');
      return;
    }
    this.notice.set(null);
  }

  protected closeRecurrencePopover(): void {
    if (this.recurrencePopover() === 'week' && this.customActive() && this.customDays().length === 0) {
      this.customDays.set(defaultCustomDays(this.remindDate()));
    }
    if (this.recurrencePopover() === 'month' && this.recurrence() === 'monthly' && this.monthDays().length === 0) {
      this.monthDays.set(defaultMonthDays(this.remindDate()));
    }
    this.recurrencePopover.set(null);
  }

  protected async saveReminder(): Promise<void> {
    if (this.permissionUnsupported()) {
      this.notice.set('Notifications are not available in this browser.');
      return;
    }

    if (this.enabled() && this.permissionBlocked()) {
      this.notice.set('Notifications are blocked. Enable them in browser settings.');
      return;
    }

    const rule = this.recurrence();
    const recurrenceDays = rule === 'custom' || rule === 'weekly'
      ? this.customDays()
      : null;
    const recurrenceMonthDays = rule === 'monthly'
      ? this.monthDays()
      : null;

    if ((rule === 'custom' || rule === 'weekly') && !recurrenceDays?.length) {
      this.notice.set('Pick at least one day for a custom repeat.');
      this.recurrencePopover.set('week');
      return;
    }

    if (rule === 'monthly' && !recurrenceMonthDays?.length) {
      this.notice.set('Pick at least one day of the month.');
      this.recurrencePopover.set('month');
      return;
    }

    this.save.emit({
      taskId: this.task().id,
      enabled: this.enabled(),
      remindDate: this.remindDate(),
      remindTime: this.remindTime(),
      recurrence: rule === 'weekly' ? 'custom' : rule,
      recurrenceDays,
      recurrenceMonthDays,
    });
  }
}
