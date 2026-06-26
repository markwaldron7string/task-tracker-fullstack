import {
  afterNextRender,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TaskStore } from '../task-store';
import { OnboardingService, TourStep } from './onboarding.service';

// Show a translucent scrim for purely informational steps.
// Hide it for steps where the user must interact with something above the sheet.
const NO_SCRIM_STEP_IDS = new Set([
  'theme', 'add-task', 'nav',
  'pro-add-task', 'pro-calendar-nav', 'pro-notifications', 'pro-coach',
]);

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

  protected showScrim = computed(() => {
    const id = this.onboarding.currentStep()?.id;
    return !id || !NO_SCRIM_STEP_IDS.has(id);
  });

  private lastStepId: string | null = null;
  private scrollLockY = 0;

  private readonly onTouchMove = (event: TouchEvent) => {
    if (!this.onboarding.active()) return;
    const target = event.target as Node | null;
    if (!target) return;
    const sheet = document.querySelector('.tour-sheet');
    const themePanel = document.querySelector('.theme-picker--tour .panel');
    if (sheet?.contains(target) || themePanel?.contains(target)) return;
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
        return;
      }
      this.lockScroll();
      const current = this.onboarding.currentStep();
      untracked(() => void this.syncStep(current));
    });
  }

  protected onNext(): void {
    if (!this.onboarding.canAdvance(this.store.tasks().length)) return;
    this.onboarding.next();
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
    window.scrollTo(0, this.scrollLockY);
  }

  private async syncStep(step: TourStep | null): Promise<void> {
    if (!step) return;

    const stepChanged = step.id !== this.lastStepId;
    if (stepChanged) {
      this.lastStepId = step.id;
    }

    if (stepChanged && step.route && !this.isCurrentRoute(step.route)) {
      await this.router.navigateByUrl(step.route);
    }

    if (stepChanged && step.id === 'theme') {
      this.onboarding.requestOpenThemePicker();
    }

    if (stepChanged && (step.id === 'add-task' || step.id === 'pro-add-task')) {
      window.setTimeout(() => {
        if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return;
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
}
