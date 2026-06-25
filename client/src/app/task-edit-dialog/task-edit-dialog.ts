import { TitleCasePipe } from '@angular/common';
import { Component, effect, input, output, signal } from '@angular/core';
import { TaskDatePicker } from '../task-date-picker/task-date-picker';
import { parseEstimateInput } from '../task-quick-parse';
import { EnrichedTask, Priority } from '../task-store';

export interface TaskEditPatch {
  id: number;
  title: string;
  priority: Priority;
  due: string | null;
  estimateMinutes: number | null;
  done: boolean;
}

const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high'];
const ESTIMATE_PRESETS: Array<{ label: string; minutes: number | null }> = [
  { label: 'None', minutes: null },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '1h', minutes: 60 },
  { label: '1.5h', minutes: 90 },
  { label: '2h', minutes: 120 },
];

@Component({
  selector: 'app-task-edit-dialog',
  imports: [TaskDatePicker, TitleCasePipe],
  templateUrl: './task-edit-dialog.html',
  styleUrl: './task-edit-dialog.css',
})
export class TaskEditDialog {
  task = input.required<EnrichedTask>();

  save = output<TaskEditPatch>();
  cancel = output<void>();

  protected readonly priorities = PRIORITIES;
  protected readonly estimatePresets = ESTIMATE_PRESETS;

  protected title = signal('');
  protected priority = signal<Priority>('none');
  protected due = signal<string | null>(null);
  protected estimateMinutes = signal<number | null>(null);
  protected done = signal(false);
  protected customEstimate = signal('');

  constructor() {
    effect(() => {
      const task = this.task();
      this.title.set(task.title);
      this.priority.set(task.priority ?? 'none');
      this.due.set(task.due);
      this.estimateMinutes.set(task.estimateMinutes);
      this.done.set(task.done);
      this.customEstimate.set(this.formatEstimate(task.estimateMinutes));
    });
  }

  protected onBackdropClick(): void {
    this.cancel.emit();
  }

  protected onDialogClick(event: Event): void {
    event.stopPropagation();
  }

  protected setPriority(value: Priority): void {
    this.priority.set(value);
  }

  protected setDue(value: string | null): void {
    this.due.set(value);
  }

  protected setEstimate(minutes: number | null): void {
    this.estimateMinutes.set(minutes);
    this.customEstimate.set(this.formatEstimate(minutes));
  }

  protected applyCustomEstimate(input: HTMLInputElement): void {
    const parsed = parseEstimateInput(input.value);
    if (input.value.trim() && parsed === null) return;
    this.setEstimate(parsed);
  }

  protected saveTask(): void {
    const title = this.title().trim();
    if (!title) return;

    this.save.emit({
      id: this.task().id,
      title,
      priority: this.priority(),
      due: this.due(),
      estimateMinutes: this.estimateMinutes(),
      done: this.done(),
    });
  }

  private formatEstimate(minutes: number | null): string {
    if (minutes === null) return '';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
}
