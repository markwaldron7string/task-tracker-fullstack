import { Component, computed, inject, input, output } from '@angular/core';
import { TaskDetailsOverlayService } from '../task-details-overlay.service';
import { TaskEditOverlayService } from '../task-edit-overlay.service';
import { TaskPickerOverlayService } from '../task-picker-overlay.service';
import { EnrichedTask } from '../task-store';

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

@Component({
  selector: 'app-task-item',
  host: { class: 'task-item-host' },
  imports: [],
  templateUrl: './task-item.html',
  styleUrl: './task-item.css',
})
export class TaskItem {
  private editOverlay = inject(TaskEditOverlayService);
  private detailsOverlay = inject(TaskDetailsOverlayService);
  private pickerOverlay = inject(TaskPickerOverlayService);

  task = input.required<EnrichedTask>();
  position = input<number>();
  toggle = output<number>();
  remove = output<number>();
  edit = output<{ id: number; title: string }>();
  update = output<{ id: number; title: string; priority: EnrichedTask['priority']; due: string | null; estimateMinutes: number | null; done: boolean }>();
  cyclePriority = output<number>();
  dueChange = output<{ id: number; due: string | null }>();
  estimateChange = output<{ id: number; estimateMinutes: number | null }>();
  cycleEstimate = output<number>();

  protected priority = computed(() => this.task().priority ?? 'none');

  protected isOverdue = computed(() => {
    const due = this.task().due;
    return !!due && !this.task().done && due < todayIso();
  });

  protected isToday = computed(() => this.task().due === todayIso());

  protected dueLabel = computed(() => {
    const due = this.task().due;
    if (!due) return 'Set date';
    const date = new Date(due + 'T00:00:00');
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });

  protected estimateLabel = computed(() => {
    const mins = this.task().estimateMinutes;
    if (mins === null) return 'Set time';
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h${m}`;
  });

  protected duePickerOpen = computed(() => this.pickerOverlay.isDueOpen(this.task().id));
  protected estimatePickerOpen = computed(() => this.pickerOverlay.isEstimateOpen(this.task().id));
  protected hasChecklist = computed(() => (this.task().checklist?.length ?? 0) > 0);
  protected checklistProgress = computed(() => {
    const items = this.task().checklist ?? [];
    if (items.length === 0) return null;
    return `${items.filter(item => item.done).length}/${items.length}`;
  });

  onToggle(): void { this.toggle.emit(this.task().id); }
  onRemove(): void { this.remove.emit(this.task().id); }
  onCyclePriority(): void { this.cyclePriority.emit(this.task().id); }

  openDuePicker(event: Event): void {
    event.stopPropagation();
    this.pickerOverlay.openDue(this.task().id, this.task().due);
  }

  openEstimatePicker(event: Event): void {
    event.stopPropagation();
    this.pickerOverlay.openEstimate(this.task().id, this.task().estimateMinutes);
  }

  openEditDialog(event: Event): void {
    event.stopPropagation();
    this.pickerOverlay.close();
    this.editOverlay.open(this.task());
  }

  openDetailsDialog(event: Event): void {
    event.stopPropagation();
    this.pickerOverlay.close();
    this.detailsOverlay.open(this.task());
  }
}
