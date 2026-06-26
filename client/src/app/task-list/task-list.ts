import { Component, ElementRef, computed, effect, inject, signal } from '@angular/core';
import { injectOverlayDismissBinding } from '../overlay-dismiss.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { ProService } from '../pro.service';
import { TaskItem } from '../task-item/task-item';
import { TaskSummary } from '../task-summary/task-summary';
import { TASK_DOMAINS, projectLabel } from '../task-domains';
import { TaskReminderService } from '../task-reminder.service';
import { TaskStore, Task } from '../task-store';

const TOUR_DEMO_TASK: Task = {
  id: 0,
  title: 'Walk the dog',
  done: false,
  priority: 'none',
  due: null,
  estimateMinutes: null,
  project: null,
  recurrence: null,
  checklist: [],
};

const SEARCH_MIN_TASKS = 10;

@Component({
  selector: 'app-task-list',
  imports: [TaskItem, TaskSummary],
  templateUrl: './task-list.html',
  styleUrl: './task-list.css',
})
export class TaskList {
  store = inject(TaskStore);
  protected reminders = inject(TaskReminderService);
  protected onboarding = inject(OnboardingService);
  protected pro = inject(ProService);
  private host = inject(ElementRef<HTMLElement>);
  protected confirmClearOpen = signal(false);

  protected taskEntryLocked = this.onboarding.taskEntryLocked;
  protected introAddTaskStepActive = this.onboarding.introAddTaskStepActive;
  protected introTaskControlsStepActive = this.onboarding.introTaskControlsStepActive;
  protected tourDemoTask = TOUR_DEMO_TASK;
  protected showSearch = computed(() => this.store.tasks().length >= SEARCH_MIN_TASKS);

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

    effect(() => {
      if (this.store.tasks().length < SEARCH_MIN_TASKS && this.store.searchQuery()) {
        this.store.setSearchQuery('');
      }
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

  protected async toggleMasterNotifications(): Promise<void> {
    if (!this.pro.unlocked()) return;
    if (this.reminders.isMasterEnabled()) {
      this.reminders.setMasterEnabled(false);
      return;
    }
    await this.reminders.enableMasterWithPermission();
  }

  protected tryAddTask(input: HTMLInputElement): void {
    if (this.taskEntryLocked()) return;
    const value = input.value.trim();
    if (!value) return;
    this.store.addTask(value);
    input.value = '';
    if (this.onboarding.addTaskStepActive()) {
      input.blur();
      this.onboarding.notifyTaskAdded();
    }
  }

  protected ignoreTourDemoAction(): void {}
}
