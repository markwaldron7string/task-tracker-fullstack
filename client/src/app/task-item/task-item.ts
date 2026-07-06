import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { Component, computed, effect, inject, input, OnDestroy, output, signal } from '@angular/core';
import { OnboardingService } from '../onboarding/onboarding.service';
import { ProService } from '../pro.service';
import { TaskDetailsOverlayService } from '../task-details-overlay.service';
import { TaskEditOverlayService } from '../task-edit-overlay.service';
import { projectLabel, isCoachPlan } from '../task-domains';
import { recurrenceLabel } from '../task-recurrence';
import { TaskReminderOverlayService } from '../task-reminder-overlay.service';
import { TaskReminderService } from '../task-reminder.service';
import { EnrichedTask } from '../task-store';

@Component({
  selector: 'app-task-item',
  hostDirectives: [
    {
      directive: CdkDrag,
      inputs: ['cdkDragStartDelay: dragStartDelay', 'cdkDragBoundary: dragBoundary'],
    },
  ],
  host: {
    class: 'task-item-host',
    '[attr.data-tour]': 'position() === 1 ? "first-task" : null',
    '[class.tour-demo-locked]': 'tourDemoLocked()',
    '[class.task-item-dragging]': 'isDragging()',
    '[class.task-item-pressing]': 'isPressing()',
  },
  imports: [CdkDragHandle],
  templateUrl: './task-item.html',
  styleUrl: './task-item.css',
})
export class TaskItem implements OnDestroy {
  private editOverlay = inject(TaskEditOverlayService);
  private detailsOverlay = inject(TaskDetailsOverlayService);
  private reminderOverlay = inject(TaskReminderOverlayService);
  private reminders = inject(TaskReminderService);
  private onboarding = inject(OnboardingService);
  private pro = inject(ProService);
  private drag = inject(CdkDrag);

  task = input.required<EnrichedTask>();
  position = input<number>();
  dragEnabled = input(true);
  dragStartDelay = input(0);
  readonly dragBoundary = '.task-list';

  protected showReminders = computed(() => this.pro.unlocked());
  protected tourDemoLocked = computed(() => this.onboarding.introTaskControlsStepActive());
  protected projectLabel = projectLabel;
  protected isCoachPlan = isCoachPlan;
  protected recurrenceLabel = recurrenceLabel;

  isDragging = signal(false);
  isPressing = signal(false);
  dragDisabled = computed(() => !this.dragEnabled() || this.tourDemoLocked());

  toggle = output<number>();
  remove = output<number>();
  edit = output<{ id: number; title: string }>();
  update = output<{ id: number; title: string; priority: EnrichedTask['priority']; due: string | null; estimateMinutes: number | null; done: boolean }>();
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

  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly dragStartedSub = this.drag.started.subscribe(() => this.onDragStarted());
  private readonly dragEndedSub = this.drag.ended.subscribe(() => this.onDragEnded());

  constructor() {
    effect(() => {
      this.drag.disabled = this.dragDisabled();
    });
  }

  ngOnDestroy() {
    this.dragStartedSub.unsubscribe();
    this.dragEndedSub.unsubscribe();
    this.clearPressState();
  }

  onToggle(): void {
    if (this.tourDemoLocked()) return;
    this.toggle.emit(this.task().id);
  }
  onRemove(): void {
    if (this.tourDemoLocked()) return;
    this.remove.emit(this.task().id);
  }
  openEditDialog(event: Event): void {
    if (this.tourDemoLocked()) return;
    event.stopPropagation();
    this.editOverlay.open(this.task());
  }

  openDetailsDialog(event: Event): void {
    if (this.tourDemoLocked()) return;
    event.stopPropagation();
    this.detailsOverlay.open(this.task());
  }

  onBellClick(event: Event): void {
    if (this.tourDemoLocked() || !this.pro.unlocked()) return;
    event.stopPropagation();
    this.reminderOverlay.open(this.task());
  }

  onPressStart(event: PointerEvent) {
    if (this.dragDisabled() || event.pointerType === 'mouse') return;

    this.clearPressState();
    this.pressTimer = setTimeout(() => {
      this.isPressing.set(true);
    }, Math.max(0, this.dragStartDelay() - 80));
  }

  onPressEnd() {
    this.clearPressState();
  }

  private onDragStarted() {
    this.isDragging.set(true);
    this.clearPressState();
  }

  private onDragEnded() {
    this.isDragging.set(false);
    this.clearPressState();
  }

  private clearPressState() {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
    this.isPressing.set(false);
  }
}
