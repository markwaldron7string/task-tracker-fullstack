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
import { OnboardingService, TourPlacement, TourStep } from './onboarding.service';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface FlagPosition {
  top: number;
  left: number;
  arrowX: number;
}

const SPOTLIGHT_PAD = 8;
const FLAG_GAP = 14;
const FLAG_WIDTH = 320;
const FLAG_HEIGHT_EST = 190;
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
  protected spotlight = signal<Box | null>(null);
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

  private lastStepId: string | null = null;
  private layoutAttempts = 0;

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
        document.body.style.overflow = '';
        this.spotlight.set(null);
        this.flagPos.set(null);
        return;
      }

      document.body.style.overflow = 'hidden';
      const current = this.onboarding.currentStep();
      const taskCount = this.store.tasks().length;
      untracked(() => {
        void taskCount;
        this.onboarding.refreshLayout();
        void this.syncStep(current);
      });
    });

    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      if (this.onboarding.active()) {
        queueMicrotask(() => this.layoutCurrentStep());
      }
    });
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected onViewportChange(): void {
    if (this.onboarding.active()) {
      this.layoutCurrentStep();
    }
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

    queueMicrotask(() => this.layoutCurrentStep());
  }

  private isCurrentRoute(route: string): boolean {
    const path = this.router.url.split('?')[0];
    return route === '/' ? path === '/' : path.startsWith(route);
  }

  private layoutCurrentStep(): void {
    const step = this.onboarding.currentStep();
    if (!step) return;

    if (step.placement === 'center' || !step.target) {
      this.spotlight.set(null);
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
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });

    const rect = el.getBoundingClientRect();
    const box: Box = {
      top: Math.max(VIEWPORT_PAD, rect.top - SPOTLIGHT_PAD),
      left: Math.max(VIEWPORT_PAD, rect.left - SPOTLIGHT_PAD),
      width: rect.width + SPOTLIGHT_PAD * 2,
      height: rect.height + SPOTLIGHT_PAD * 2,
    };

    this.spotlight.set(box);
    this.flagPlacement.set(step.placement);
    this.flagPos.set(this.computeFlagPosition(box, step.placement));
  }

  private computeFlagPosition(box: Box, placement: TourPlacement): FlagPosition {
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
    const arrowX = Math.min(Math.max(targetCenterX - left, 18), flagW - 18);

    this.flagPlacement.set(resolvedPlacement);
    return { top, left, arrowX };
  }
}
