import { Injectable, computed, inject, signal } from '@angular/core';
import { ProService } from '../pro.service';

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type TourKind = 'intro' | 'pro';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  placement: TourPlacement;
  target?: string;
  route?: string;
}

const INTRO_STORAGE_KEY = 'ttf-onboarding-complete';
const PRO_TOUR_STORAGE_KEY = 'ttf-pro-onboarding-complete';

const INTRO_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Task Tracker',
    body: 'A quick tour of the essentials — first, pick a color you like.',
    placement: 'center',
  },
  {
    id: 'theme',
    target: 'theme-picker',
    title: 'Pick your color',
    body: 'Choose a built-in theme swatch below. Custom accent colors unlock with Pro later in the tour.',
    placement: 'bottom',
    route: '/',
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
    body: 'Use Edit for due dates and details. Tap the bell to set device reminders on any row.',
    placement: 'top',
    route: '/',
  },
  {
    id: 'upgrade',
    target: 'upgrade',
    title: 'Unlock Pro features',
    body: 'Upgrade for calendar planning, recurring tasks, the AI Planning Coach, and a full Pro walkthrough when you unlock.',
    placement: 'bottom',
  },
];

const PRO_TOUR_STEPS: TourStep[] = [
  {
    id: 'pro-welcome',
    title: 'Welcome to Pro',
    body: 'You unlocked the full planning suite. This quick tour shows where everything lives.',
    placement: 'center',
  },
  {
    id: 'pro-calendar-nav',
    target: 'nav-calendar',
    title: 'Calendar planning',
    body: 'Month and week views let you drag tasks between days and schedule your week visually.',
    placement: 'bottom',
    route: '/calendar',
  },
  {
    id: 'pro-calendar',
    target: 'calendar-view',
    title: 'Plan on the calendar',
    body: 'Drop unscheduled tasks onto days, switch between month and week, and open task details from any chip.',
    placement: 'bottom',
    route: '/calendar',
  },
  {
    id: 'pro-today-nav',
    target: 'nav-today',
    title: 'Today view',
    body: 'Your daily command center — overdue, due today, and what’s coming next.',
    placement: 'bottom',
    route: '/today',
  },
  {
    id: 'pro-today-planning',
    target: 'today-planning',
    title: 'Realistic day planning',
    body: 'Set your workday length, see today’s load at a glance, and use “Lighten today” when you’re overcommitted. After 4pm, wrap up rolls unfinished tasks to tomorrow.',
    placement: 'bottom',
    route: '/today',
  },
  {
    id: 'pro-coach',
    target: 'coach-fab',
    title: 'AI Planning Coach',
    body: 'Ask what to focus on, check if you’re overcommitted, or build a multi-day schedule with checklists — then apply it to your calendar.',
    placement: 'top',
    route: '/',
  },
  {
    id: 'pro-themes',
    target: 'theme-picker',
    title: 'Custom themes',
    body: 'Pro unlocks custom accent colors on top of every built-in theme.',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'pro-domains',
    target: 'add-task',
    title: 'Domains & recurring tasks',
    body: 'Tag tasks with #work or #health, set repeats like “daily” or “every week” in quick-add or Edit, and use search to find anything fast.',
    placement: 'bottom',
    route: '/',
  },
];

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private pro = inject(ProService);

  readonly active = signal(false);
  readonly kind = signal<TourKind>('intro');
  readonly stepIndex = signal(0);
  readonly layoutRevision = signal(0);
  readonly pendingProTour = signal(false);

  readonly isProTour = computed(() => this.kind() === 'pro');

  readonly steps = computed(() => {
    this.layoutRevision();
    const source = this.kind() === 'pro' ? PRO_TOUR_STEPS : INTRO_TOUR_STEPS;
    return source.filter(step => {
      if (step.id === 'upgrade' && this.pro.unlocked()) return false;
      if (step.id === 'task-controls' && !document.querySelector('[data-tour="first-task"]')) {
        return false;
      }
      if (step.id === 'pro-calendar' && !document.querySelector('[data-tour="calendar-view"]')) {
        return false;
      }
      if (step.id === 'pro-today-planning' && !document.querySelector('[data-tour="today-planning"]')) {
        return false;
      }
      return true;
    });
  });

  readonly currentStep = computed(() => this.steps()[this.stepIndex()] ?? null);

  readonly introThemeStepActive = computed(
    () => this.active() && this.kind() === 'intro' && this.currentStep()?.id === 'theme'
  );

  readonly openThemePickerTick = signal(0);

  readonly progressLabel = computed(() => {
    const total = this.steps().length;
    if (!total) return '';
    const prefix = this.kind() === 'pro' ? 'Pro tour' : 'Tour';
    return `${prefix} · ${this.stepIndex() + 1} of ${total}`;
  });

  shouldShowIntro(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(INTRO_STORAGE_KEY) !== '1';
  }

  shouldShowPro(): boolean {
    if (typeof localStorage === 'undefined') return false;
    if (!this.pro.unlocked()) return false;
    return localStorage.getItem(PRO_TOUR_STORAGE_KEY) !== '1';
  }

  /** @deprecated Use shouldShowIntro */
  shouldShow(): boolean {
    return this.shouldShowIntro();
  }

  startIntro(): void {
    if (!this.shouldShowIntro()) return;
    this.kind.set('intro');
    this.stepIndex.set(0);
    this.active.set(true);
  }

  startPro(): void {
    if (!this.shouldShowPro()) return;
    if (this.active() && this.kind() === 'intro') {
      this.pendingProTour.set(true);
      return;
    }
    this.beginProTour();
  }

  /** @deprecated Use startIntro */
  start(): void {
    this.startIntro();
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
    const storageKey = this.kind() === 'pro' ? PRO_TOUR_STORAGE_KEY : INTRO_STORAGE_KEY;
    this.active.set(false);
    localStorage.setItem(storageKey, '1');

    if (this.pendingProTour()) {
      this.pendingProTour.set(false);
      if (this.shouldShowPro()) {
        queueMicrotask(() => this.beginProTour());
      }
    }
  }

  reset(): void {
    localStorage.removeItem(INTRO_STORAGE_KEY);
    localStorage.removeItem(PRO_TOUR_STORAGE_KEY);
    this.pendingProTour.set(false);
    this.kind.set('intro');
    this.stepIndex.set(0);
    this.active.set(true);
  }

  refreshLayout(): void {
    this.layoutRevision.update(n => n + 1);
  }

  requestOpenThemePicker(): void {
    this.openThemePickerTick.update(n => n + 1);
  }

  skipThemeStep(): void {
    if (this.currentStep()?.id === 'theme') {
      this.next();
    }
  }

  private beginProTour(): void {
    this.kind.set('pro');
    this.stepIndex.set(0);
    this.active.set(true);
  }

  private isStepReachable(step: TourStep): boolean {
    if (step.placement === 'center' || !step.target) return true;
    return !!document.querySelector(`[data-tour="${step.target}"]`);
  }
}
