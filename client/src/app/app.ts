import { afterNextRender, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { OnboardingWalkthrough } from './onboarding/onboarding-walkthrough';
import { ProAssistant } from './pro-assistant/pro-assistant';
import { ProService } from './pro.service';
import { TaskDatePicker } from './task-date-picker/task-date-picker';
import { TaskDetailsDialog } from './task-details-dialog/task-details-dialog';
import { TaskDetailsOverlayService } from './task-details-overlay.service';
import { TaskEditDialog, TaskEditPatch } from './task-edit-dialog/task-edit-dialog';
import { TaskEditOverlayService } from './task-edit-overlay.service';
import { TaskEstimatePicker } from './task-estimate-picker/task-estimate-picker';
import { TaskPickerOverlayService } from './task-picker-overlay.service';
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
    TaskEstimatePicker,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  appName = 'Task Tracker';
  protected pro = inject(ProService);
  protected store = inject(TaskStore);
  protected editOverlay = inject(TaskEditOverlayService);
  protected detailsOverlay = inject(TaskDetailsOverlayService);
  protected pickerOverlay = inject(TaskPickerOverlayService);
  protected _theme = inject(ThemeService);

  constructor() {
    afterNextRender(() => {
      const header = document.querySelector('header');
      if (!header) return;

      const syncHeaderHeight = () => {
        document.documentElement.style.setProperty(
          '--app-header-height',
          `${header.getBoundingClientRect().height}px`
        );
      };

      syncHeaderHeight();
      new ResizeObserver(syncHeaderHeight).observe(header);
    });
  }

  protected onEditSave(patch: TaskEditPatch): void {
    const { id, ...fields } = patch;
    this.store.updateTask(id, fields);
    this.editOverlay.close();
  }

  protected onToggleChecklistItem(event: { taskId: number; itemId: string }): void {
    this.store.toggleChecklistItem(event.taskId, event.itemId);
    const task = this.store.tasks().find(item => item.id === event.taskId);
    if (task) this.detailsOverlay.open(task);
  }

  protected onDueSelect(due: string | null): void {
    const state = this.pickerOverlay.duePicker();
    if (!state) return;
    this.store.setDue(state.taskId, due);
    this.pickerOverlay.close();
  }

  protected onEstimateSelect(estimateMinutes: number | null): void {
    const state = this.pickerOverlay.estimatePicker();
    if (!state) return;
    this.store.setEstimateMinutes(state.taskId, estimateMinutes);
    this.pickerOverlay.close();
  }
}
