import { Component, computed, input, output } from '@angular/core';
import { formatScheduleDue } from '../pro-coach';
import { ChecklistItem, EnrichedTask } from '../task-store';

@Component({
  selector: 'app-task-details-dialog',
  imports: [],
  templateUrl: './task-details-dialog.html',
  styleUrl: './task-details-dialog.css',
})
export class TaskDetailsDialog {
  task = input.required<EnrichedTask>();

  toggleItem = output<{ taskId: number; itemId: string }>();
  close = output<void>();

  protected checklist = computed(() => this.task().checklist ?? []);
  protected progress = computed(() => {
    const items = this.checklist();
    if (items.length === 0) return null;
    const done = items.filter(item => item.done).length;
    return { done, total: items.length };
  });

  protected formatDue = formatScheduleDue;

  protected onBackdropClick(): void {
    this.close.emit();
  }

  protected onDialogClick(event: Event): void {
    event.stopPropagation();
  }

  protected onToggleItem(item: ChecklistItem): void {
    this.toggleItem.emit({ taskId: this.task().id, itemId: item.id });
  }
}
