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

const SWIPE_ACTION_WIDTH = 72;
const SWIPE_OPEN_THRESHOLD = 36;

const swipeCloseRegistry = new Set<() => void>();

function closeOpenSwipes(except?: () => void) {
  for (const close of swipeCloseRegistry) {
    if (close !== except) close();
  }
}

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
    '[class.task-swipe-open]': 'swipeOpen() !== "none"',
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
  swipeOffset = signal(0);
  swipeOpen = signal<'none' | 'left' | 'right'>('none');
  swipeAnimating = signal(false);
  dragDisabled = computed(() => !this.dragEnabled() || this.tourDemoLocked());
  protected leftRevealWidth = computed(() =>
    this.showReminders() ? SWIPE_ACTION_WIDTH * 2 : SWIPE_ACTION_WIDTH
  );
  protected swipeTransform = computed(() => {
    const offset = this.swipeOffset();
    return offset === 0 ? '' : `translateX(${offset}px)`;
  });

  toggle = output<number>();
  remove = output<number>();
  edit = output<{ id: number; title: string }>();
  update = output<{ id: number; title: string; priority: EnrichedTask['priority']; due: string | null; estimateMinutes: number | null; done: boolean }>();
  protected hasChecklist = computed(() => (this.task().checklist?.length ?? 0) > 0);
  protected hasChips = computed(() => {
    const task = this.task();
    return !!(
      (task.project && !isCoachPlan(task.project))
      || task.pending
      || this.hasChecklist()
    );
  });
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
  private swipePointerId: number | null = null;
  private swipeStartX = 0;
  private swipeStartOffset = 0;
  private swipeTracking = false;
  private readonly closeSwipe = () => this.resetSwipe();
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
    swipeCloseRegistry.delete(this.closeSwipe);
    this.resetSwipe(false);
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

  onSwipeEdit(event: Event): void {
    this.resetSwipe();
    this.openEditDialog(event);
  }

  onSwipeDelete(event: Event): void {
    this.resetSwipe();
    this.onRemove();
  }

  onSwipeBell(event: Event): void {
    this.resetSwipe();
    this.onBellClick(event);
  }

  onSwipePointerDown(event: PointerEvent) {
    if (this.tourDemoLocked() || event.pointerType === 'mouse') return;

    const target = event.target as HTMLElement;
    if (target.closest('.drag-handle, .task-checkbox, .details-chip, .task-chips button, .swipe-action')) {
      return;
    }

    if (this.swipeOpen() !== 'none') {
      this.resetSwipe();
      return;
    }

    closeOpenSwipes(this.closeSwipe);
    this.swipePointerId = event.pointerId;
    this.swipeStartX = event.clientX;
    this.swipeStartOffset = this.swipeOffset();
    this.swipeTracking = true;
    this.swipeAnimating.set(false);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onSwipePointerMove(event: PointerEvent) {
    if (!this.swipeTracking || this.swipePointerId !== event.pointerId) return;

    const delta = event.clientX - this.swipeStartX;
    const leftMax = this.leftRevealWidth();
    const rightMax = SWIPE_ACTION_WIDTH;
    const next = Math.max(-rightMax, Math.min(leftMax, this.swipeStartOffset + delta));

    if (Math.abs(next) > 6) {
      event.preventDefault();
    }

    this.swipeOffset.set(next);
  }

  onSwipePointerEnd(event: PointerEvent) {
    if (!this.swipeTracking || this.swipePointerId !== event.pointerId) return;

    this.swipeTracking = false;
    this.swipePointerId = null;
    this.swipeAnimating.set(true);

    const offset = this.swipeOffset();
    if (offset > SWIPE_OPEN_THRESHOLD) {
      this.snapSwipe('left');
      return;
    }
    if (offset < -SWIPE_OPEN_THRESHOLD) {
      this.snapSwipe('right');
      return;
    }

    this.resetSwipe();
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
    this.resetSwipe();
  }

  private onDragEnded() {
    this.isDragging.set(false);
    this.clearPressState();
  }

  private snapSwipe(direction: 'left' | 'right') {
    closeOpenSwipes(this.closeSwipe);
    swipeCloseRegistry.add(this.closeSwipe);
    this.swipeOpen.set(direction);
    this.swipeOffset.set(direction === 'left' ? this.leftRevealWidth() : -SWIPE_ACTION_WIDTH);
  }

  private resetSwipe(animate = true) {
    this.swipeAnimating.set(animate);
    this.swipeOffset.set(0);
    this.swipeOpen.set('none');
    swipeCloseRegistry.delete(this.closeSwipe);
  }

  private clearPressState() {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
    this.isPressing.set(false);
  }
}
