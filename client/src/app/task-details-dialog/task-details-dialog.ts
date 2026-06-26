import { Component, ElementRef, computed, inject, input, output } from '@angular/core';
import { injectOverlayDismissBinding } from '../overlay-dismiss.service';
import { formatScheduleDue } from '../pro-coach';
import { buildDayTaskGroups, formatDayLabel } from '../task-day-groups';
import { DetailsView } from '../task-details-overlay.service';
import { ChecklistItem, TaskStore, countOpenDayTasks } from '../task-store';

@Component({
  selector: 'app-task-details-dialog',
  imports: [],
  templateUrl: './task-details-dialog.html',
  styleUrl: './task-details-dialog.css',
})
export class TaskDetailsDialog {
  private store = inject(TaskStore);
  private host = inject(ElementRef<HTMLElement>);

  view = input.required<DetailsView>();

  toggleItem = output<{ taskId: number; itemId: string }>();
  close = output<void>();
  planFilterChange = output<string>();

  protected formatDue = formatScheduleDue;

  constructor() {
    injectOverlayDismissBinding(() => ({
      contains: target => this.host.nativeElement.contains(target),
      close: () => this.close.emit(),
    }));
  }

  protected isDayView = computed(() => this.view().kind === 'day');

  protected task = computed(() => {
    const current = this.view();
    return current.kind === 'task' ? current.task : null;
  });

  protected dayIso = computed(() => {
    const current = this.view();
    return current.kind === 'day' ? current.iso : null;
  });

  protected planFilter = computed(() => {
    const current = this.view();
    return current.kind === 'day' ? current.planFilter : '__all__';
  });

  protected dayTasks = computed(() => {
    const iso = this.dayIso();
    if (!iso) return [];
    return this.store.tasksByDueDate()[iso] ?? [];
  });

  protected dayLabel = computed(() => {
    const iso = this.dayIso();
    return iso ? formatDayLabel(iso) : '';
  });

  protected dayItemCount = computed(() => countOpenDayTasks(this.dayTasks()));

  protected planGroups = computed(() => buildDayTaskGroups(this.dayTasks()));

  protected showPlanFilters = computed(() =>
    this.planGroups().some(group => group.key !== '__other__' && group.label)
  );

  protected visibleGroups = computed(() => {
    const filter = this.planFilter();
    const groups = this.planGroups();
    if (filter === '__all__') return groups;
    return groups.filter(group => group.key === filter);
  });

  protected checklist = computed(() => this.task()?.checklist ?? []);

  protected progress = computed(() => {
    const items = this.checklist();
    if (items.length === 0) return null;
    const done = items.filter(item => item.done).length;
    return { done, total: items.length };
  });

  protected taskProgress(task: { checklist: ChecklistItem[] }): { done: number; total: number } | null {
    if (task.checklist.length === 0) return null;
    const done = task.checklist.filter(item => item.done).length;
    return { done, total: task.checklist.length };
  }

  protected onBackdropClick(): void {
    this.close.emit();
  }

  protected onDialogClick(event: Event): void {
    event.stopPropagation();
  }

  protected onToggleItem(item: ChecklistItem, taskId: number): void {
    this.toggleItem.emit({ taskId, itemId: item.id });
  }

  protected selectPlanFilter(filter: string): void {
    this.planFilterChange.emit(filter);
  }
}
