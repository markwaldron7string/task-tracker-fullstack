import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  untracked,
} from '@angular/core';
import { OnboardingService } from '../onboarding/onboarding.service';
import { isMobileSwipeLayout } from '../onboarding/onboarding-layout';
import { ProService } from '../pro.service';
import { TaskDetailsOverlayService } from '../task-details-overlay.service';
import { TaskEditOverlayService } from '../task-edit-overlay.service';
import { projectLabel, isCoachPlan } from '../task-domains';
import { recurrenceLabel } from '../task-recurrence';
import { TaskReminderOverlayService } from '../task-reminder-overlay.service';
import { TaskReminderService } from '../task-reminder.service';
import { EnrichedTask } from '../task-store';

export const MOBILE_DRAG_HOLD_MS = 420;

const SWIPE_ACTION_WIDTH = 72;
const SWIPE_OPEN_THRESHOLD = 36;
const SWIPE_AXIS_LOCK_PX = 10;

const swipeCloseRegistry = new Set<() => void>();

function closeOpenSwipes(except?: () => void) {
  for (const close of swipeCloseRegistry) {
    if (close !== except) close();
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest(
    '.task-checkbox, .details-chip, .task-chips button, .swipe-action, .bell-btn, .action-btn'
  );
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
    '[class.task-item-pressing]': 'isPressing() && !isDragging()',
    '[class.task-swipe-open]': 'swipeOpen() !== "none"',
    '[class.task-item-mobile]': 'mobileSwipeLayout()',
  },
  imports: [CdkDragHandle, NgTemplateOutlet],
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
  private host = inject(ElementRef<HTMLElement>);
  private destroyRef = inject(DestroyRef);

  task = input.required<EnrichedTask>();
  position = input<number>();
  dragEnabled = input(true);
  dragStartDelay = input(0);
  readonly dragBoundary = '.task-list';

  protected mobileSwipeLayout = computed(() => isMobileSwipeLayout());
  protected usePanelDragHandle = computed(() => this.mobileSwipeLayout() && this.dragEnabled());
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
  swipeActive = signal(false);
  dragDisabled = computed(() => !this.dragEnabled() || this.tourDemoLocked());
  protected leftRevealWidth = computed(() =>
    this.showReminders() ? SWIPE_ACTION_WIDTH * 2 : SWIPE_ACTION_WIDTH
  );
  protected showStartActions = computed(() =>
    this.swipeOffset() > 4 || this.swipeOpen() === 'left'
  );
  protected showEndActions = computed(() =>
    this.swipeOffset() < -4 || this.swipeOpen() === 'right'
  );
  protected swipeTransform = computed(() => {
    const offset = this.swipeOffset();
    return offset === 0 ? '' : `translate3d(${offset}px, 0, 0)`;
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

  private pressFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  private activePointerId: number | null = null;
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeStartOffset = 0;
  private swipeTracking = false;
  private swipeAxisLocked = false;
  private demoSwipePrimed = false;
  private readonly closeSwipe = () => this.resetSwipe();
  private readonly dragStartedSub = this.drag.started.subscribe(() => this.onDragStarted());
  private readonly dragEndedSub = this.drag.ended.subscribe(() => this.onDragEnded());
  private readonly onPointerDown = (event: PointerEvent) => this.handlePointerDown(event);
  private readonly onPointerMove = (event: PointerEvent) => this.handlePointerMove(event);
  private readonly onPointerUp = (event: PointerEvent) => this.handlePointerUp(event);

  constructor() {
    effect(() => {
      this.drag.disabled =
        this.dragDisabled()
        || (isMobileSwipeLayout() && this.swipeActive());
    });

    effect(() => {
      const demoActive = this.onboarding.introTaskControlsStepActive() && this.position() === 1;
      if (!demoActive) {
        this.demoSwipePrimed = false;
        if (untracked(this.swipeOpen) !== 'none') {
          this.resetSwipe(false);
        }
        return;
      }
      if (!this.demoSwipePrimed && isMobileSwipeLayout()) {
        this.demoSwipePrimed = true;
        this.snapSwipe('left');
      }
    });

    afterNextRender(() => {
      if (!isMobileSwipeLayout()) return;

      const host = this.host.nativeElement;
      host.addEventListener('pointerdown', this.onPointerDown, { passive: true });
      host.addEventListener('pointermove', this.onPointerMove, { passive: false });
      host.addEventListener('pointerup', this.onPointerUp, { passive: true });
      host.addEventListener('pointercancel', this.onPointerUp, { passive: true });

      this.destroyRef.onDestroy(() => {
        host.removeEventListener('pointerdown', this.onPointerDown);
        host.removeEventListener('pointermove', this.onPointerMove);
        host.removeEventListener('pointerup', this.onPointerUp);
        host.removeEventListener('pointercancel', this.onPointerUp);
      });
    });
  }

  ngOnDestroy() {
    this.dragStartedSub.unsubscribe();
    this.dragEndedSub.unsubscribe();
    this.clearPressFeedback();
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
    if (this.tourDemoLocked()) return;
    this.resetSwipe();
    this.openEditDialog(event);
  }

  onSwipeDelete(event: Event): void {
    if (this.tourDemoLocked()) return;
    this.resetSwipe();
    this.onRemove();
  }

  onSwipeBell(event: Event): void {
    if (this.tourDemoLocked()) return;
    this.resetSwipe();
    this.onBellClick(event);
  }

  private handlePointerDown(event: PointerEvent) {
    if (!isMobileSwipeLayout() || event.pointerType === 'mouse') return;
    if (this.dragDisabled() || isInteractiveTarget(event.target)) return;
    if (this.isDragging()) return;

    if (this.swipeOpen() !== 'none' && !this.swipeTracking) {
      this.resetSwipe();
      return;
    }

    closeOpenSwipes(this.closeSwipe);
    this.activePointerId = event.pointerId;
    this.swipeStartX = event.clientX;
    this.swipeStartY = event.clientY;
    this.swipeStartOffset = this.swipeOffset();
    this.swipeTracking = false;
    this.swipeAxisLocked = false;
    this.swipeAnimating.set(false);

    this.clearPressFeedback();
    const holdMs = this.dragStartDelay() || MOBILE_DRAG_HOLD_MS;
    this.pressFeedbackTimer = setTimeout(() => {
      if (!this.isDragging() && !this.swipeTracking) {
        this.isPressing.set(true);
      }
    }, Math.max(0, holdMs - 80));
  }

  private handlePointerMove(event: PointerEvent) {
    if (!isMobileSwipeLayout() || this.activePointerId !== event.pointerId) return;
    if (this.isDragging()) return;

    const deltaX = event.clientX - this.swipeStartX;
    const deltaY = event.clientY - this.swipeStartY;

    if (!this.swipeAxisLocked) {
      if (Math.abs(deltaX) < SWIPE_AXIS_LOCK_PX && Math.abs(deltaY) < SWIPE_AXIS_LOCK_PX) {
        return;
      }

      this.swipeAxisLocked = true;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.clearPressFeedback();
        this.swipeTracking = true;
        this.swipeActive.set(true);
        this.drag.disabled = true;
      } else {
        this.releasePointerGesture();
        return;
      }
    }

    if (!this.swipeTracking) return;

    event.preventDefault();

    const leftMax = this.leftRevealWidth();
    const rightMax = SWIPE_ACTION_WIDTH;
    const next = Math.max(-rightMax, Math.min(leftMax, this.swipeStartOffset + deltaX));
    this.swipeOffset.set(next);
  }

  private handlePointerUp(event: PointerEvent) {
    if (!isMobileSwipeLayout() || this.activePointerId !== event.pointerId) return;

    this.clearPressFeedback();

    if (this.swipeTracking) {
      this.finishSwipe();
      return;
    }

    this.releasePointerGesture();
  }

  private releasePointerGesture() {
    this.activePointerId = null;
    this.swipeAxisLocked = false;
    this.swipeTracking = false;
    this.isPressing.set(false);
  }

  private finishSwipe() {
    this.swipeTracking = false;
    this.activePointerId = null;
    this.swipeAxisLocked = false;
    this.swipeAnimating.set(true);

    const offset = this.swipeOffset();
    const moved = Math.abs(offset - this.swipeStartOffset);

    if (moved < 8) {
      if (this.swipeOpen() !== 'none') {
        this.resetSwipe();
      } else {
        this.updateSwipeActive();
      }
      return;
    }

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

  private onDragStarted() {
    if (isMobileSwipeLayout() && this.swipeTracking) return;

    this.isDragging.set(true);
    this.clearPressFeedback();
    this.isPressing.set(false);
    this.resetSwipe(false);
    this.releasePointerGesture();
    this.swipeActive.set(false);
  }

  private onDragEnded() {
    this.isDragging.set(false);
    this.isPressing.set(false);
    this.releasePointerGesture();
  }

  private snapSwipe(direction: 'left' | 'right') {
    closeOpenSwipes(this.closeSwipe);
    swipeCloseRegistry.add(this.closeSwipe);
    this.swipeOpen.set(direction);
    this.swipeAnimating.set(true);
    this.swipeOffset.set(direction === 'left' ? this.leftRevealWidth() : -SWIPE_ACTION_WIDTH);
    this.updateSwipeActive();
  }

  private resetSwipe(animate = true) {
    this.swipeAnimating.set(animate);
    this.swipeOffset.set(0);
    this.swipeOpen.set('none');
    swipeCloseRegistry.delete(this.closeSwipe);
    this.updateSwipeActive();
  }

  private updateSwipeActive() {
    this.swipeActive.set(this.swipeTracking || this.swipeOpen() !== 'none');
  }

  private clearPressFeedback() {
    if (this.pressFeedbackTimer) {
      clearTimeout(this.pressFeedbackTimer);
      this.pressFeedbackTimer = null;
    }
  }
}
