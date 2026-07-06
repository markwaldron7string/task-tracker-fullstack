import { CdkDrag, CdkDragHandle } from '@angular/cdk/drag-drop';
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

const SWIPE_ACTION_WIDTH = 72;
const SWIPE_OPEN_THRESHOLD = 36;
const SWIPE_AXIS_LOCK_PX = 8;

const swipeCloseRegistry = new Set<() => void>();

function closeOpenSwipes(except?: () => void) {
  for (const close of swipeCloseRegistry) {
    if (close !== except) close();
  }
}

function isSwipeIgnoredTarget(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest(
    '.drag-handle, .task-checkbox, .details-chip, .task-chips button, .swipe-action'
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
  private host = inject(ElementRef<HTMLElement>);
  private destroyRef = inject(DestroyRef);

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

  private pressTimer: ReturnType<typeof setTimeout> | null = null;
  private activeTouchId: number | null = null;
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeStartOffset = 0;
  private swipeTracking = false;
  private swipeAxisLocked = false;
  private demoSwipePrimed = false;
  private readonly closeSwipe = () => this.resetSwipe();
  private readonly dragStartedSub = this.drag.started.subscribe(() => this.onDragStarted());
  private readonly dragEndedSub = this.drag.ended.subscribe(() => this.onDragEnded());
  private readonly onTouchStart = (event: TouchEvent) => this.handleTouchStart(event);
  private readonly onTouchMove = (event: TouchEvent) => this.handleTouchMove(event);
  private readonly onTouchEnd = (event: TouchEvent) => this.handleTouchEnd(event);

  constructor() {
    effect(() => {
      const blockDrag = this.dragDisabled()
        || (isMobileSwipeLayout() && this.swipeActive());
      this.drag.disabled = blockDrag;
    });

    effect(() => {
      const demoActive = this.onboarding.introTaskControlsStepActive() && this.position() === 1;
      if (!demoActive) {
        this.demoSwipePrimed = false;
        if (this.swipeOpen() !== 'none') {
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

      const panel = this.host.nativeElement.querySelector('.task-swipe-panel');
      if (!panel) return;

      panel.addEventListener('touchstart', this.onTouchStart, { passive: true });
      panel.addEventListener('touchmove', this.onTouchMove, { passive: false });
      panel.addEventListener('touchend', this.onTouchEnd, { passive: true });
      panel.addEventListener('touchcancel', this.onTouchEnd, { passive: true });

      this.destroyRef.onDestroy(() => {
        panel.removeEventListener('touchstart', this.onTouchStart);
        panel.removeEventListener('touchmove', this.onTouchMove);
        panel.removeEventListener('touchend', this.onTouchEnd);
        panel.removeEventListener('touchcancel', this.onTouchEnd);
      });
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

  private handleTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1 || isSwipeIgnoredTarget(event.target)) return;

    event.stopPropagation();

    const touch = event.touches[0];
    closeOpenSwipes(this.closeSwipe);
    this.activeTouchId = touch.identifier;
    this.swipeStartX = touch.clientX;
    this.swipeStartY = touch.clientY;
    this.swipeStartOffset = this.swipeOffset();
    this.swipeTracking = true;
    this.swipeAxisLocked = false;
    this.swipeAnimating.set(false);
    this.swipeActive.set(true);
  }

  private handleTouchMove(event: TouchEvent) {
    if (!this.swipeTracking || this.activeTouchId === null) return;

    const touch = Array.from(event.touches).find(item => item.identifier === this.activeTouchId);
    if (!touch) return;

    const deltaX = touch.clientX - this.swipeStartX;
    const deltaY = touch.clientY - this.swipeStartY;

    if (!this.swipeAxisLocked) {
      if (Math.abs(deltaX) < SWIPE_AXIS_LOCK_PX && Math.abs(deltaY) < SWIPE_AXIS_LOCK_PX) {
        return;
      }
      this.swipeAxisLocked = Math.abs(deltaX) > Math.abs(deltaY);
      if (!this.swipeAxisLocked) {
        this.cancelTouchSwipe();
        return;
      }
    }

    event.preventDefault();
    event.stopPropagation();

    const leftMax = this.leftRevealWidth();
    const rightMax = SWIPE_ACTION_WIDTH;
    const next = Math.max(-rightMax, Math.min(leftMax, this.swipeStartOffset + deltaX));
    this.swipeOffset.set(next);
  }

  private handleTouchEnd(event: TouchEvent) {
    if (this.activeTouchId === null) return;

    const touch = Array.from(event.changedTouches).find(item => item.identifier === this.activeTouchId);
    if (!touch || !this.swipeTracking) return;

    event.stopPropagation();
    this.finishSwipe();
  }

  private cancelTouchSwipe() {
    this.swipeTracking = false;
    this.activeTouchId = null;
    this.swipeAxisLocked = false;
    this.updateSwipeActive();
  }

  private finishSwipe() {
    this.swipeTracking = false;
    this.activeTouchId = null;
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

    if (this.swipeOpen() !== 'none') {
      this.resetSwipe();
      return;
    }

    this.resetSwipe();
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

  private clearPressState() {
    if (this.pressTimer) {
      clearTimeout(this.pressTimer);
      this.pressTimer = null;
    }
    this.isPressing.set(false);
  }
}
