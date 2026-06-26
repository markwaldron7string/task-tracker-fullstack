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
  computeAboveAnchorFlagPosition,
  computeHeaderPinnedFlagPosition,
  computeThemeStepFlagPosition,
  resolveTourTarget,
  SpotlightBox,
} from './onboarding-layout';
import { OnboardingService, TourPlacement, TourStep } from './onboarding.service';

interface FlagPosition {
  top: number;
  left: number;
  arrowX: number;
}

const FLAG_GAP = 14;
const FLAG_WIDTH = 320;
const FLAG_HEIGHT_EST = 240;
const VIEWPORT_PAD = 12;
const HEADER_PINNED_STEPS = new Set(['add-task', 'pro-add-task']);

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

  protected showAddTaskSkip = computed(() => this.onboarding.addTaskStepActive());

  protected canAdvance = computed(() => this.onboarding.canAdvance(this.store.tasks().length));

  private lastStepId: string | null = null;
  private layoutAttempts = 0;
  private scrollLockY = 0;
  private layoutTarget: Element | null = null;
  private positionObserver: ResizeObserver | null = null;
  private readonly onViewportChange = () => this.scheduleLayout();
  private readonly onTouchMove = (event: TouchEvent) => {
    if (!this.onboarding.active()) return;
    const target = event.target as Node | null;
    if (!target) return;
    const flag = document.querySelector('.tour-flag');
    const themePanel = document.querySelector('.theme-picker--tour .panel');
    if (flag?.contains(target) || themePanel?.contains(target)) return;
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
    if (stepChanged && (step.id === 'theme' || step.id === 'task-controls' || step.id === 'upgrade')) {
      window.setTimeout(() => this.scheduleLayout(), 80);
      window.setTimeout(() => this.scheduleLayout(), 200);
    }

    if (stepChanged && (step.id === 'add-task' || step.id === 'pro-add-task')) {
      window.setTimeout(() => {
        const input = document.querySelector(
          '[data-tour="add-task"] .task-input'
        ) as HTMLInputElement | null;
        input?.focus();
      }, 100);
    }
  }

  private isCurrentRoute(route: string): boolean {
    const path = this.router.url.split('?')[0];
    return route === '/' ? path === '/' : path.startsWith(route);
  }

  private layoutCurrentStep(): void {
    const step = this.onboarding.currentStep();
    if (!step) return;

    if (!step.target) {
      this.spotlight.set(null);
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
    const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
    const navBottom = document.querySelector('[data-tour="nav"]')?.getBoundingClientRect().bottom ?? headerBottom;
    const flagW = this.currentFlagWidth();
    const flagH = this.currentFlagHeight();

    if (step.id === 'theme') {
      const themeFlag = computeThemeStepFlagPosition(
        box,
        flagW,
        FLAG_HEIGHT_EST,
        VIEWPORT_PAD,
        FLAG_GAP
      );
      this.spotlight.set(box);
      this.flagPlacement.set(themeFlag.placement);
      this.flagPos.set({ top: themeFlag.top, left: themeFlag.left, arrowX: themeFlag.arrowX });
      return;
    }

    if (HEADER_PINNED_STEPS.has(step.id)) {
      const targetRect = target.getBoundingClientRect();
      const pinned = computeHeaderPinnedFlagPosition(
        targetRect,
        headerBottom,
        flagW,
        VIEWPORT_PAD,
        6
      );
      this.spotlight.set(box);
      this.flagPlacement.set(pinned.placement);
      this.flagPos.set({ top: pinned.top, left: pinned.left, arrowX: pinned.arrowX });
      return;
    }

    if (step.id === 'task-controls') {
      const targetRect = target.getBoundingClientRect();
      const aboveTarget = computeAboveAnchorFlagPosition(
        targetRect,
        flagW,
        flagH,
        VIEWPORT_PAD
      );
      this.spotlight.set(box);
      this.flagPlacement.set(aboveTarget.placement);
      this.flagPos.set({ top: aboveTarget.top, left: aboveTarget.left, arrowX: aboveTarget.arrowX });
      return;
    }

    if (step.id === 'upgrade') {
      const targetRect = target.getBoundingClientRect();
      const pinned = computeHeaderPinnedFlagPosition(
        targetRect,
        navBottom,
        flagW,
        VIEWPORT_PAD
      );
      this.spotlight.set(box);
      this.flagPlacement.set(pinned.placement);
      this.flagPos.set({ top: pinned.top, left: pinned.left, arrowX: pinned.arrowX });
      return;
    }

    this.spotlight.set(box);
    this.flagPlacement.set(step.placement);
    this.flagPos.set(this.computeFlagPosition(box, step.placement));
  }

  private computeFlagPosition(box: SpotlightBox, placement: TourPlacement): FlagPosition {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const flagW = this.currentFlagWidth();
    const flagH = this.currentFlagHeight();

    let top = box.top + box.height + FLAG_GAP;
    let left = box.left + box.width / 2 - flagW / 2;
    let resolvedPlacement = placement;

    if (placement === 'top' || (placement === 'bottom' && top + flagH > vh - VIEWPORT_PAD)) {
      top = box.top - flagH - FLAG_GAP;
      resolvedPlacement = 'top';
    }

    if (top < VIEWPORT_PAD) {
      top = box.top + box.height + FLAG_GAP;
      resolvedPlacement = 'bottom';
    }

    left = Math.min(Math.max(left, VIEWPORT_PAD), vw - flagW - VIEWPORT_PAD);
    top = Math.min(Math.max(top, VIEWPORT_PAD), vh - flagH - VIEWPORT_PAD);

    const targetCenterX = box.left + box.width / 2;
    const arrowX = Math.min(Math.max(targetCenterX - left, 28), flagW - 28);

    this.flagPlacement.set(resolvedPlacement);
    return { top, left, arrowX };
  }

  private currentFlagWidth(): number {
    const vw = window.innerWidth;
    if (vw <= 480) return Math.min(288, vw - 20);
    return Math.min(FLAG_WIDTH, vw - VIEWPORT_PAD * 2);
  }

  private currentFlagHeight(): number {
    const flag = document.querySelector('.tour-flag') as HTMLElement | null;
    return flag?.getBoundingClientRect().height || FLAG_HEIGHT_EST;
  }
}
