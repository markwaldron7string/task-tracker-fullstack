import { Injectable, computed, inject, signal } from '@angular/core';
import { ProService } from '../pro.service';

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  placement: TourPlacement;
  target?: string;
  route?: string;
}

const STORAGE_KEY = 'ttf-onboarding-complete';

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Task Tracker',
    body: 'A quick tour of the essentials — takes under a minute.',
    placement: 'center',
  },
  {
    id: 'add-task',
    target: 'add-task',
    title: 'Add tasks in plain English',
    body: 'Type naturally, like “Review PR tomorrow 30m high”. We parse due dates, duration, and priority for you.',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'nav',
    target: 'nav',
    title: 'Filter your work',
    body: 'Switch between All Tasks, Today, Calendar, Active, and Completed to focus on what matters now.',
    placement: 'bottom',
  },
  {
    id: 'task-controls',
    target: 'first-task',
    title: 'Fine-tune each task',
    body: 'Set due dates, time estimates, and priority on any row. Use Details for checklist plans from the AI coach.',
    placement: 'top',
    route: '/',
  },
  {
    id: 'theme',
    target: 'theme-picker',
    title: 'Make it yours',
    body: 'Pick a built-in theme or customize accent colors to match your style.',
    placement: 'bottom',
  },
  {
    id: 'upgrade',
    target: 'upgrade',
    title: 'Unlock Pro features',
    body: 'Upgrade for Calendar planning, the AI Planning Coach, and smart schedules with checklists.',
    placement: 'bottom',
  },
  {
    id: 'coach',
    target: 'coach-fab',
    title: 'Meet your Planning Coach',
    body: 'Tap Coach to ask what to focus on, check if you’re overcommitted, or build a weekly schedule.',
    placement: 'top',
  },
];

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private pro = inject(ProService);

  readonly active = signal(false);
  readonly stepIndex = signal(0);
  readonly layoutRevision = signal(0);

  readonly steps = computed(() => {
    this.layoutRevision();
    return TOUR_STEPS.filter(step => {
      if (step.id === 'upgrade' && this.pro.unlocked()) return false;
      if (step.id === 'coach' && !this.pro.unlocked()) return false;
      if (step.id === 'task-controls' && !document.querySelector('[data-tour="first-task"]')) {
        return false;
      }
      return true;
    });
  });

  readonly currentStep = computed(() => this.steps()[this.stepIndex()] ?? null);

  readonly progressLabel = computed(() => {
    const total = this.steps().length;
    if (!total) return '';
    return `${this.stepIndex() + 1} of ${total}`;
  });

  shouldShow(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) !== '1';
  }

  start(): void {
    if (!this.shouldShow()) return;
    this.stepIndex.set(0);
    this.active.set(true);
  }

  next(): void {
    const steps = this.steps();
    let nextIndex = this.stepIndex() + 1;

    while (nextIndex < steps.length && !this.isStepReachable(steps[nextIndex])) {
      nextIndex += 1;
    }

    if (nextIndex >= steps.length) {
      this.complete();
      return;
    }

    this.stepIndex.set(nextIndex);
  }

  skip(): void {
    this.complete();
  }

  complete(): void {
    this.active.set(false);
    localStorage.setItem(STORAGE_KEY, '1');
  }

  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.stepIndex.set(0);
    this.active.set(true);
  }

  refreshLayout(): void {
    this.layoutRevision.update(n => n + 1);
  }

  private isStepReachable(step: TourStep): boolean {
    if (step.placement === 'center' || !step.target) return true;
    return !!document.querySelector(`[data-tour="${step.target}"]`);
  }
}
