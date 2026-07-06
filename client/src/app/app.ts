import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { injectOverlayDismissBinding } from './overlay-dismiss.service';
import { RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { AppUpdateService } from './app-update.service';
import { OnboardingWalkthrough } from './onboarding/onboarding-walkthrough';
import { OnboardingService } from './onboarding/onboarding.service';
import { ProAssistant } from './pro-assistant/pro-assistant';
import { ProService } from './pro.service';
import { TaskDatePicker } from './task-date-picker/task-date-picker';
import { TaskDetailsDialog } from './task-details-dialog/task-details-dialog';
import { TaskDetailsOverlayService } from './task-details-overlay.service';
import { TaskEditDialog, TaskEditPatch } from './task-edit-dialog/task-edit-dialog';
import { TaskEditOverlayService } from './task-edit-overlay.service';
import { TaskPickerOverlayService } from './task-picker-overlay.service';
import { TaskReminderDialog, TaskReminderDialogSave } from './task-reminder-dialog/task-reminder-dialog';
import { TaskReminderOverlayService } from './task-reminder-overlay.service';
import { TaskReminderService } from './task-reminder.service';
import { TaskStore } from './task-store';
import { ThemePicker } from './theme-picker/theme-picker';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ThemePicker,
    ProAssistant,
    OnboardingWalkthrough,
    TaskEditDialog,
    TaskDetailsDialog,
    TaskDatePicker,
    TaskReminderDialog,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  appName = 'Task Tracker';
  protected pro = inject(ProService);
  protected onboarding = inject(OnboardingService);
  protected store = inject(TaskStore);
  protected editOverlay = inject(TaskEditOverlayService);
  protected detailsOverlay = inject(TaskDetailsOverlayService);
  protected pickerOverlay = inject(TaskPickerOverlayService);
  protected reminderOverlay = inject(TaskReminderOverlayService);
  protected reminders = inject(TaskReminderService);
  protected appUpdate = inject(AppUpdateService);
  protected _theme = inject(ThemeService);
  protected refreshConfirmOpen = signal(false);
  private host = inject(ElementRef<HTMLElement>);

  constructor() {
    injectOverlayDismissBinding(() => {
      if (!this.refreshConfirmOpen()) return null;
      return {
        contains: target => {
          const dialog = this.host.nativeElement.querySelector('.refresh-confirm-dialog');
          return !!dialog?.contains(target);
        },
        close: () => this.cancelAppRefresh(),
      };
    });

    injectOverlayDismissBinding(() => {
      if (!this.pickerOverlay.bulkReschedule()) return null;
      return {
        contains: target => {
          const scrim = document.querySelector('.picker-scrim');
          const picker = document.querySelector('app-task-date-picker .picker-panel--sheet');
          return !!(
            (scrim && scrim.contains(target))
            || (picker && picker.contains(target))
          );
        },
        close: () => this.pickerOverlay.close(),
      };
    });

    afterNextRender(() => {
      const header = document.querySelector('header');
      if (!header) return;

      const syncHeaderHeight = () => {
        document.documentElement.style.setProperty(
          '--app-header-height',
          `${Math.ceil(header.getBoundingClientRect().height)}px`
        );
      };

      syncHeaderHeight();
      new ResizeObserver(syncHeaderHeight).observe(header);
      window.addEventListener('resize', syncHeaderHeight, { passive: true });
    });
  }

  protected onEditSave(patch: TaskEditPatch): void {
    const { id, ...fields } = patch;
    this.store.updateTask(id, fields);
    this.editOverlay.close();
  }

  protected async onReminderSave(save: TaskReminderDialogSave): Promise<void> {
    const task = this.store.tasks().find(item => item.id === save.taskId);
    if (!task) {
      this.reminderOverlay.close();
      return;
    }

    const ok = await this.reminders.saveConfig(save.taskId, save);
    if (!ok) return;

    const recurrenceChanged = save.recurrence !== task.recurrence;
    if (recurrenceChanged) {
      this.store.updateTask(save.taskId, { recurrence: save.recurrence });
    }

    this.reminderOverlay.close();
  }

  protected onToggleChecklistItem(event: { taskId: number; itemId: string }): void {
    this.store.toggleChecklistItem(event.taskId, event.itemId);
    const view = this.detailsOverlay.view();
    if (view?.kind === 'day') return;
    const task = this.store.tasks().find(item => item.id === event.taskId);
    if (task) this.detailsOverlay.open(task);
  }

  protected onUpgradeClick(): void {
    if (this.onboarding.introUpgradeStepActive()) {
      this.onboarding.complete();
    }
  }

  protected onBulkRescheduleSelect(due: string | null): void {
    const state = this.pickerOverlay.bulkReschedule();
    if (!state) return;
    if (due) {
      for (const taskId of state.taskIds) {
        this.store.setDue(taskId, due);
      }
    }
    this.pickerOverlay.close();
  }

  protected requestAppRefresh(): void {
    if (this.appUpdate.activating()) return;
    this.refreshConfirmOpen.set(true);
  }

  protected cancelAppRefresh(): void {
    this.refreshConfirmOpen.set(false);
  }

  protected confirmAppRefresh(): void {
    this.refreshConfirmOpen.set(false);
    void this.appUpdate.refresh({ clearUserData: true });
  }
}
