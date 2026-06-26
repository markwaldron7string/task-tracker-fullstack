import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { injectOverlayDismissBinding } from '../overlay-dismiss.service';
import { TaskItem } from '../task-item/task-item';
import { TaskSummary } from '../task-summary/task-summary';
import { TASK_DOMAINS, projectLabel } from '../task-domains';
import { TaskReminderService } from '../task-reminder.service';
import { TaskStore } from '../task-store';

@Component({
  selector: 'app-task-list',
  imports: [TaskItem, TaskSummary],
  templateUrl: './task-list.html',
  styleUrl: './task-list.css',
})
export class TaskList {
  store = inject(TaskStore);
  protected reminders = inject(TaskReminderService);
  private host = inject(ElementRef<HTMLElement>);
  protected confirmClearOpen = signal(false);

  constructor() {
    injectOverlayDismissBinding(() => {
      if (!this.confirmClearOpen()) return null;
      return {
        contains: target => {
          const dialog = this.host.nativeElement.querySelector('.confirm-dialog');
          return !!dialog?.contains(target);
        },
        close: () => this.cancelClearAll(),
      };
    });
  }

  protected domainOptions = computed(() => {
    const fromTasks = this.store.projectOptions();
    const known = TASK_DOMAINS.filter(domain => fromTasks.includes(domain));
    const custom = fromTasks.filter(
      domain => !(TASK_DOMAINS as readonly string[]).includes(domain)
    );
    return [...known, ...custom];
  });

  protected domainLabel = projectLabel;

  protected toggleDomain(domain: string): void {
    this.store.setProjectFilter(this.store.projectFilter() === domain ? null : domain);
  }

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

  protected toggleMasterNotifications(): void {
    this.reminders.setMasterEnabled(!this.reminders.isMasterEnabled());
  }
}
