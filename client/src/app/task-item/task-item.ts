import { Component, computed, inject, input, output } from '@angular/core';
import { OnboardingService } from '../onboarding/onboarding.service';
import { TaskDetailsOverlayService } from '../task-details-overlay.service';
import { TaskEditOverlayService } from '../task-edit-overlay.service';
import { projectLabel, isCoachPlan } from '../task-domains';
import { recurrenceLabel } from '../task-recurrence';
import { TaskReminderOverlayService } from '../task-reminder-overlay.service';
import { TaskReminderService } from '../task-reminder.service';
import { EnrichedTask } from '../task-store';

@Component({
  selector: 'app-task-item',
  host: {
    class: 'task-item-host',
    '[attr.data-tour]': 'position() === 1 ? "first-task" : null',
  },
  imports: [],
  templateUrl: './task-item.html',
  styleUrl: './task-item.css',
})
export class TaskItem {
  protected onboarding = inject(OnboardingService);
  private editOverlay = inject(TaskEditOverlayService);
  private detailsOverlay = inject(TaskDetailsOverlayService);
  private reminderOverlay = inject(TaskReminderOverlayService);
  private reminders = inject(TaskReminderService);

  task = input.required<EnrichedTask>();
  position = input<number>();
  protected projectLabel = projectLabel;
  protected isCoachPlan = isCoachPlan;
  protected recurrenceLabel = recurrenceLabel;
  toggle = output<number>();
  remove = output<number>();
  edit = output<{ id: number; title: string }>();
  update = output<{ id: number; title: string; priority: EnrichedTask['priority']; due: string | null; estimateMinutes: number | null; done: boolean }>();
  cyclePriority = output<number>();

  protected priority = computed(() => this.task().priority ?? 'none');
  protected hasChecklist = computed(() => (this.task().checklist?.length ?? 0) > 0);
  protected masterEnabled = computed(() => this.reminders.isMasterEnabled());
  protected reminderEnabled = computed(() => this.reminders.isEnabled(this.task().id));
  protected bellTitle = computed(() => {
    if (!this.masterEnabled()) return 'Device reminders are off';
    if (this.reminderEnabled()) return 'Reminder on — click to turn off or edit';
    return 'Reminder off — click to set a reminder';
  });
  protected checklistProgress = computed(() => {
    const items = this.task().checklist ?? [];
    if (items.length === 0) return null;
    return `${items.filter(item => item.done).length}/${items.length}`;
  });

  onToggle(): void { this.toggle.emit(this.task().id); }
  onRemove(): void { this.remove.emit(this.task().id); }
  onCyclePriority(): void { this.cyclePriority.emit(this.task().id); }

  openEditDialog(event: Event): void {
    event.stopPropagation();
    this.editOverlay.open(this.task());
  }

  openDetailsDialog(event: Event): void {
    event.stopPropagation();
    this.detailsOverlay.open(this.task());
  }

  async onBellClick(event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.masterEnabled()) {
      this.reminderOverlay.open(this.task());
      return;
    }

    const result = await this.reminders.toggleEnabled(this.task());
    if (result === 'opened' || result === 'blocked') {
      this.reminderOverlay.open(this.task());
    }
  }
}
