import {
  afterNextRender,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { TaskStore } from '../task-store';
import {
  buildSpotlightBox,
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

@Component({
  selector: 'app-onboarding-walkthrough',
  templateUrl: './onboarding-walkthrough.html',
  styleUrl: './onboarding-walkthrough.css',
})
export class OnboardingWalkthrough {
  protected onboarding = inject(OnboardingService);
  private router = inject(Router);
  private store = inject(TaskStore);

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
        this.spotlight.set(null);
        this.flagPos.set(null);
        return;
      }

      this.lockScroll();
      const current = this.onboarding.currentStep();
      const layoutRevision = this.onboarding.layoutRevision();
      const taskCount = this.store.tasks().length;
      untracked(() => {
        void layoutRevision;
        void taskCount;
        void this.syncStep(current);
        if (
          current &&
          (current.id === 'add-task' ||
            current.id === 'pro-add-task' ||
            current.id === 'task-controls')
        ) {
          queueMicrotask(() => this.layoutCurrentStep());
        }
      });
    });
  }

  protected onNext(): void {
    if (!this.onboarding.canAdvance(this.store.tasks().length)) return;
    this.onboarding.next();
  }

  @HostListener('window:resize')
  protected onViewportChange(): void {
    if (this.onboarding.active()) {
      this.layoutCurrentStep();
    }
  }

  private lockScroll(): void {
    if (document.body.style.position === 'fixed') return;
    this.scrollLockY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this.scrollLockY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  }

  private unlockScroll(): void {
    if (document.body.style.position !== 'fixed') {
      document.body.style.overflow = '';
      return;
    }

    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(0, this.scrollLockY);
  }

  private async syncStep(step: TourStep | null): Promise<void> {
    if (!step) return;

    const stepChanged = step.id !== this.lastStepId;
    if (stepChanged) {
      this.lastStepId = step.id;
      this.layoutAttempts = 0;
    }

    if (stepChanged && step.route && !this.isCurrentRoute(step.route)) {
      await this.router.navigateByUrl(step.route);
    }

    if (stepChanged && step.id === 'theme') {
      this.onboarding.requestOpenThemePicker();
      queueMicrotask(() => this.layoutCurrentStep());
      window.setTimeout(() => this.layoutCurrentStep(), 80);
      window.setTimeout(() => this.layoutCurrentStep(), 220);
      return;
    }

    if (stepChanged && (step.id === 'add-task' || step.id === 'pro-add-task')) {
      queueMicrotask(() => {
        const input = document.querySelector(
          '[data-tour="add-task"] .task-input'
        ) as HTMLInputElement | null;
        input?.focus();
        this.layoutCurrentStep();
      });
      return;
    }

    queueMicrotask(() => this.layoutCurrentStep());
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

    if (step.placement === 'center') {
      // Spotlight the target element but keep the tour card centered.
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        this.layoutAttempts = 0;
        const target = resolveTourTarget(el, step.target!);
        const box = buildSpotlightBox(step, target, VIEWPORT_PAD);
        this.spotlight.set(box);
      } else if (this.layoutAttempts < 8) {
        this.layoutAttempts += 1;
        window.setTimeout(() => this.layoutCurrentStep(), 60);
        return;
      } else {
        this.spotlight.set(null);
      }
      this.flagPos.set(null);
      this.flagPlacement.set('center');
      return;
    }

    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) {
      if (this.layoutAttempts < 8) {
        this.layoutAttempts += 1;
        window.setTimeout(() => this.layoutCurrentStep(), 60);
        return;
      }
      this.onboarding.next();
      return;
    }

    this.layoutAttempts = 0;
    const target = resolveTourTarget(el, step.target!);
    const box = buildSpotlightBox(step, target, VIEWPORT_PAD);

    this.spotlight.set(box);

    if (step.id === 'theme') {
      const themeFlag = computeThemeStepFlagPosition(
        box,
        FLAG_WIDTH,
        FLAG_HEIGHT_EST,
        VIEWPORT_PAD,
        FLAG_GAP
      );
      this.flagPlacement.set(themeFlag.placement);
      this.flagPos.set({ top: themeFlag.top, left: themeFlag.left, arrowX: themeFlag.arrowX });
      return;
    }

    this.flagPlacement.set(step.placement);
    this.flagPos.set(this.computeFlagPosition(box, step.placement));
  }

  private computeFlagPosition(box: SpotlightBox, placement: TourPlacement): FlagPosition {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const flagW = Math.min(FLAG_WIDTH, vw - VIEWPORT_PAD * 2);
    const flagH = FLAG_HEIGHT_EST;

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
}
