import {
  afterNextRender,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  NgZone,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TaskStore } from '../task-store';
import {
  buildSpotlightBox,
  computeCardNearTarget,
  computeDownwardPointerAboveTarget,
  computeHeaderPinnedFlagPosition,
  computeThemeStepFlagPosition,
  computeTourPointer,
  computeViewportTopFlagPosition,
  FlagLayout,
  getVisualViewportHeight,
  getVisualViewportTop,
  isCoarsePointer,
  isKeyboardOpen,
  isMobileTour,
  resolveTourTarget,
  SpotlightBox,
  TourPointer,
} from './onboarding-layout';
import { OnboardingService, TourPlacement, TourStep } from './onboarding.service';

interface FlagPosition {
  top: number;
  left: number;
  arrowX: number;
}

const FLAG_GAP = 14;
const FLAG_WIDTH = 320;
const FLAG_HEIGHT_EST = 220;
const VIEWPORT_PAD = 12;

@Component({
  selector: 'app-onboarding-walkthrough',
  templateUrl: './onboarding-walkthrough.html',
  styleUrl: './onboarding-walkthrough.css',
})
export class OnboardingWalkthrough {
  protected onboarding = inject(OnboardingService);
  private router = inject(Router);
  private store = inject(TaskStore);
  private ngZone = inject(NgZone);

  protected step = this.onboarding.currentStep;
  protected spotlight = signal<SpotlightBox | null>(null);
  protected flagPos = signal<FlagPosition | null>(null);
  protected flagPlacement = signal<TourPlacement>('bottom');
  protected pointer = signal<TourPointer | null>(null);
  protected keyboardOpen = signal(false);

  protected showFullScrim = computed(() => {
    const step = this.step();
    if (!step) return true;
    if (
      this.keyboardOpen() &&
      isMobileTour() &&
      (step.id === 'add-task' || step.id === 'pro-add-task')
    ) {
      return false;
    }
    return true;
  });

  protected isLastStep = computed(() => {
    const steps = this.onboarding.steps();
    return this.onboarding.stepIndex() >= steps.length - 1;
  });

  protected skipLabel = computed(() =>
    this.onboarding.isProTour() ? 'Skip Pro tour' : 'Skip tour'
  );

  protected finishLabel = computed(() =>
    this.onboarding.isProTour() ? 'Start using Pro' : 'Get started'
  );

  protected showThemeSkip = computed(() => this.onboarding.introThemeStepActive());

  protected showAddTaskSkip = computed(
    () => this.onboarding.isProTour() && this.onboarding.addTaskStepActive()
  );

  protected canAdvance = computed(() => this.onboarding.canAdvance(this.store.tasks().length));

  protected nextLabel = computed(() => {
    const step = this.step();
    if (!step) return 'Next';
    if (this.isLastStep()) return this.finishLabel();
    if (step.id === 'theme') return 'Continue';
    if (step.id === 'pro-add-task') {
      return this.store.tasks().length > 0 ? 'Continue' : 'Next';
    }
    return 'Next';
  });

  private lastStepId: string | null = null;
  private layoutAttempts = 0;
  private scrollLockY = 0;
  private layoutTarget: Element | null = null;
  private positionObserver: ResizeObserver | null = null;
  private lastKeyboardOpen = false;
  private readonly onViewportChange = () => {
    const open = isKeyboardOpen();
    const step = this.onboarding.currentStep();
    const isAddTask = step?.id === 'add-task' || step?.id === 'pro-add-task';
    if (isAddTask && open === this.lastKeyboardOpen) return;
    this.lastKeyboardOpen = open;
    this.scheduleLayout();
  };
  private readonly onTouchMove = (event: TouchEvent) => {
    if (!this.onboarding.active()) return;
    const target = event.target as Node | null;
    if (!target) return;
    const flag = document.querySelector('.tour-flag');
    const themePanel = document.querySelector('.theme-picker--tour .panel');
    const addTask = document.querySelector('[data-tour="add-task"]');
    if (flag?.contains(target) || themePanel?.contains(target) || addTask?.contains(target)) {
      return;
    }
    if (this.onboarding.introThemeStepActive()) return;
    event.preventDefault();
  };

  constructor() {
    afterNextRender(() => {
      if (this.onboarding.shouldShowIntro()) {
        this.onboarding.startIntro();
      } else if (this.onboarding.shouldShowPro()) {
        this.onboarding.startPro();
      }
    });

    effect(() => {
      const steps = this.onboarding.steps();
      const idx = this.onboarding.stepIndex();
      if (this.onboarding.active() && steps.length > 0 && idx >= steps.length) {
        this.onboarding.stepIndex.set(steps.length - 1);
      }
    });

    effect(() => {
      if (!this.onboarding.active()) {
        this.unlockScroll();
        this.unwatchLayoutTarget();
        this.ngZone.run(() => {
          this.spotlight.set(null);
          this.flagPos.set(null);
          this.pointer.set(null);
        });
        return;
      }

      this.lockScroll();
      this.bindViewportListeners();
      const current = this.onboarding.currentStep();
      const layoutRevision = this.onboarding.layoutRevision();
      const taskCount = this.store.tasks().length;
      const upgradeLocked = this.onboarding.introUpgradeLocked();
      untracked(() => {
        void layoutRevision;
        void taskCount;
        void upgradeLocked;
        void this.syncStep(current);
      });
    });
  }

  protected onNext(): void {
    if (!this.onboarding.canAdvance(this.store.tasks().length)) return;
    this.onboarding.next();
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.scheduleLayout();
  }

  private scheduleLayout(): void {
    if (!this.onboarding.active()) return;
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.ngZone.run(() => this.layoutCurrentStep());
        });
      });
    });
  }

  private bindViewportListeners(): void {
    window.visualViewport?.addEventListener('resize', this.onViewportChange);
    window.visualViewport?.addEventListener('scroll', this.onViewportChange);
  }

  private unbindViewportListeners(): void {
    window.visualViewport?.removeEventListener('resize', this.onViewportChange);
    window.visualViewport?.removeEventListener('scroll', this.onViewportChange);
  }

  private watchLayoutTarget(el: Element): void {
    if (this.layoutTarget === el && this.positionObserver) return;
    this.unwatchLayoutTarget();
    this.layoutTarget = el;
    this.positionObserver = new ResizeObserver(() => this.scheduleLayout());
    this.positionObserver.observe(el);
    const header = document.querySelector('header');
    if (header) this.positionObserver.observe(header);
    const flag = document.querySelector('.tour-flag');
    if (flag) this.positionObserver.observe(flag);
  }

  private unwatchLayoutTarget(): void {
    this.positionObserver?.disconnect();
    this.positionObserver = null;
    this.layoutTarget = null;
  }

  private lockScroll(): void {
    if (document.documentElement.dataset['tourScrollLocked'] === '1') return;
    this.scrollLockY = window.scrollY;
    document.documentElement.dataset['tourScrollLocked'] = '1';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.addEventListener('touchmove', this.onTouchMove, { passive: false });
  }

  private unlockScroll(): void {
    if (document.documentElement.dataset['tourScrollLocked'] !== '1') return;
    delete document.documentElement.dataset['tourScrollLocked'];
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.removeEventListener('touchmove', this.onTouchMove);
    this.unbindViewportListeners();
    window.scrollTo(0, this.scrollLockY);
  }

  private async syncStep(step: TourStep | null): Promise<void> {
    if (!step) return;

    const stepChanged = step.id !== this.lastStepId;
    if (stepChanged) {
      this.lastStepId = step.id;
      this.layoutAttempts = 0;
      this.unwatchLayoutTarget();
    }

    if (stepChanged && step.route && !this.isCurrentRoute(step.route)) {
      await this.router.navigateByUrl(step.route);
    }

    if (stepChanged && step.id === 'theme') {
      this.onboarding.requestOpenThemePicker();
    }

    this.scheduleLayout();
    if (stepChanged) {
      window.setTimeout(() => this.scheduleLayout(), 80);
      window.setTimeout(() => this.scheduleLayout(), 220);
    }
    if (stepChanged && step.id === 'pro-add-task' && !isCoarsePointer()) {
      window.setTimeout(() => {
        const input = document.querySelector(
          '[data-tour="add-task"] .task-input'
        ) as HTMLInputElement | null;
        input?.focus({ preventScroll: true });
      }, 120);
    }
  }

  private isCurrentRoute(route: string): boolean {
    const path = this.router.url.split('?')[0];
    return route === '/' ? path === '/' : path.startsWith(route);
  }

  private layoutCurrentStep(): void {
    const step = this.onboarding.currentStep();
    if (!step) return;

    const keyboardOpen = isKeyboardOpen();
    this.keyboardOpen.set(keyboardOpen);
    this.syncViewportCssVars();

    if (!step.target) {
      this.spotlight.set(null);
      this.pointer.set(null);
      this.flagPos.set(null);
      this.flagPlacement.set('center');
      return;
    }

    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      if (this.layoutAttempts < 12) {
        this.layoutAttempts += 1;
        window.setTimeout(() => this.scheduleLayout(), 60);
        return;
      }
      this.onboarding.next();
      return;
    }

    this.layoutAttempts = 0;
    this.watchLayoutTarget(el);

    const target = resolveTourTarget(el, step.target!);
    const box = buildSpotlightBox(step, target);
    const targetRect = this.spotlightTargetRect(step, target, box);
    const flagW = this.currentFlagWidth();
    const flagH = this.currentFlagHeight();
    const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const navBottom =
      document.querySelector('[data-tour="nav"]')?.getBoundingClientRect().bottom ?? headerBottom;

    if (this.isMobileAddTaskWithKeyboard(step, keyboardOpen)) {
      this.spotlight.set(null);
      const flag = computeViewportTopFlagPosition(flagW, 8);
      this.flagPlacement.set(flag.placement);
      this.flagPos.set({ top: flag.top, left: flag.left, arrowX: flag.arrowX });
      this.pointer.set(null);
      return;
    }

    const flag = this.layoutFlag(step, box, targetRect, flagW, flagH, headerBottom, navBottom);

    this.spotlight.set(box);
    this.flagPlacement.set(flag.placement);
    this.flagPos.set({ top: flag.top, left: flag.left, arrowX: flag.arrowX });
    this.pointer.set(this.computePointerForStep(step, flag, flagW, flagH, targetRect));
  }

  private computePointerForStep(
    step: TourStep,
    flag: FlagLayout,
    flagW: number,
    flagH: number,
    targetRect: DOMRect,
  ): TourPointer | null {
    if (!this.shouldShowPointer(step)) return null;
    if (step.id === 'task-controls') {
      return computeDownwardPointerAboveTarget(targetRect);
    }
    return computeTourPointer(flag, flagW, flagH, targetRect);
  }

  private syncViewportCssVars(): void {
    document.documentElement.style.setProperty('--vv-offset-top', `${getVisualViewportTop()}px`);
    document.documentElement.style.setProperty('--vv-height', `${getVisualViewportHeight()}px`);
  }

  private isMobileAddTaskWithKeyboard(step: TourStep, keyboardOpen: boolean): boolean {
    return (
      keyboardOpen &&
      isMobileTour() &&
      (step.id === 'add-task' || step.id === 'pro-add-task')
    );
  }

  private shouldShowPointer(step: TourStep): boolean {
    if (
      step.id === 'pro-calendar-nav' ||
      step.id === 'pro-calendar' ||
      step.id === 'add-task'
    ) {
      return false;
    }
    if (isMobileTour() && step.id === 'pro-add-task') {
      return false;
    }
    return true;
  }

  private layoutFlag(
    step: TourStep,
    box: SpotlightBox,
    targetRect: DOMRect,
    flagW: number,
    flagH: number,
    headerBottom: number,
    navBottom: number
  ): FlagLayout {
    switch (step.id) {
      case 'theme':
        return computeThemeStepFlagPosition(box, flagW, flagH, VIEWPORT_PAD, FLAG_GAP);
      case 'add-task':
      case 'pro-add-task':
        if (isMobileTour()) {
          return computeHeaderPinnedFlagPosition(targetRect, headerBottom, flagW, VIEWPORT_PAD, 10);
        }
        return computeCardNearTarget(targetRect, flagW, flagH, VIEWPORT_PAD, 20, 'above');
      case 'task-controls':
        if (isMobileTour()) {
          return computeHeaderPinnedFlagPosition(targetRect, headerBottom, flagW, VIEWPORT_PAD, 10);
        }
        return computeCardNearTarget(targetRect, flagW, flagH, VIEWPORT_PAD, 24, 'above');
      case 'nav':
        return computeHeaderPinnedFlagPosition(targetRect, navBottom, flagW, VIEWPORT_PAD, 10);
      case 'upgrade':
        return computeHeaderPinnedFlagPosition(targetRect, navBottom, flagW, VIEWPORT_PAD, 10);
      case 'pro-coach':
        return computeCardNearTarget(targetRect, flagW, flagH, VIEWPORT_PAD, 20, 'above');
      default:
        return computeCardNearTarget(targetRect, flagW, flagH, VIEWPORT_PAD, FLAG_GAP, 'below');
    }
  }

  private spotlightTargetRect(step: TourStep, target: Element, box: SpotlightBox): DOMRect {
    if (step.target === 'first-task-actions' || step.target === 'add-task' || step.target === 'nav') {
      const pad = spotlightPaddingForStep(step.target);
      return new DOMRect(
        box.left + pad,
        box.top + pad,
        box.width - pad * 2,
        box.height - pad * 2
      );
    }
    return target.getBoundingClientRect();
  }

  private currentFlagWidth(): number {
    const vw = window.innerWidth;
    if (vw <= 480) return Math.min(288, vw - 20);
    return Math.min(FLAG_WIDTH, vw - VIEWPORT_PAD * 2);
  }

  private currentFlagHeight(): number {
    const flag = document.querySelector('.tour-flag') as HTMLElement | null;
    return flag?.offsetHeight || FLAG_HEIGHT_EST;
  }
}

function spotlightPaddingForStep(targetId: string): number {
  if (targetId === 'first-task-actions') return 3;
  if (targetId === 'add-task') return 4;
  if (targetId === 'nav') return 4;
  return 4;
}
