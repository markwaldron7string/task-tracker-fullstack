import { Component, inject, signal } from '@angular/core';
import { TaskItem } from '../task-item/task-item';
import { TaskSummary } from '../task-summary/task-summary';
import { TaskStore } from '../task-store';

@Component({
  selector: 'app-task-list',
  imports: [TaskItem, TaskSummary],
  templateUrl: './task-list.html',
  styleUrl: './task-list.css',
})
export class TaskList {
  store = inject(TaskStore);
  protected confirmClearOpen = signal(false);

  protected requestClearAll(): void {
    if (this.store.tasks().length === 0) return;
    this.confirmClearOpen.set(true);
  }

  protected cancelClearAll(): void {
    this.confirmClearOpen.set(false);
  }

  protected confirmClearAll(): void {
    this.store.clearTasks();
    this.confirmClearOpen.set(false);
  }
}
