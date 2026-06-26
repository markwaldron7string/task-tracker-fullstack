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
    body: 'Let’s take a quick tour — you’ll pick a theme, see how to add tasks, and learn the basics.',
    placement: 'center',
  },
  {
    id: 'theme',
    target: 'theme-picker',
    title: 'Pick your color',
    body: 'Choose Light, Dark, or Neon, then tap a swatch. Try it now — your theme applies instantly.',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'add-task',
    target: 'add-task',
    title: 'Add tasks here',
    body: 'Type a task and tap Add — try something like “Walk the dog tomorrow”. This field is where new tasks start.',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'task-controls',
    target: 'first-task-actions',
    title: 'Manage each task',
    body: 'Every row has a bell for reminders, Edit for details, and Delete to remove the task.',
    placement: 'top',
    route: '/',
  },
  {
    id: 'nav',
    target: 'nav',
    title: 'Filter your work',
    body: 'Use these tabs to switch between All Tasks, Today, Calendar, Active, and Completed.',
    placement: 'bottom',
  },
  {
    id: 'upgrade',
    target: 'upgrade',
    title: 'Unlock Pro features',
    body: 'Upgrade anytime for calendar planning, recurring tasks, and the AI Planning Coach.',
    placement: 'bottom',
  },
];

const PRO_TOUR_STEPS: TourStep[] = [
  {
    id: 'pro-welcome',
    title: 'Welcome to Pro',
    body: 'A quick tour of Pro — calendar planning, device reminders, and your AI Planning Coach.',
    placement: 'center',
  },
  {
    id: 'pro-add-task',
    target: 'add-task',
    title: 'Add your first task',
    body: 'Start with one task — type something simple like “Review PR tomorrow” and press Add or Enter.',
    placement: 'bottom',
    route: '/',
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
    id: 'pro-notifications',
    target: 'notifications-toggle',
    title: 'Device reminders',
    body: 'Turn reminders on for the whole list, then tap the bell on any task row to schedule alerts on this device.',
    placement: 'bottom',
    route: '/',
  },
  {
    id: 'pro-coach',
    target: 'coach-fab',
    title: 'AI Planning Coach',
    body: 'Ask what to focus on, check if you’re overcommitted, or build a multi-day schedule — then apply it to your calendar.',
    placement: 'top',
    route: '/',
  },
];

const ADD_TASK_STEP_IDS = new Set(['add-task', 'pro-add-task']);

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
      if (step.id === 'pro-add-task' && document.querySelector('[data-tour="first-task"]')) {
        return false;
      }
      if (step.id === 'pro-calendar' && !document.querySelector('[data-tour="calendar-view"]')) {
        return false;
      }
      return true;
    });
  });

  readonly currentStep = computed(() => this.steps()[this.stepIndex()] ?? null);

  readonly introTourActive = computed(() => this.active() && this.kind() === 'intro');

  readonly introThemeStepActive = computed(
    () => this.introTourActive() && this.currentStep()?.id === 'theme'
  );

  readonly introUpgradeStepActive = computed(
    () => this.introTourActive() && this.currentStep()?.id === 'upgrade'
  );

  readonly introUpgradeLocked = computed(
    () => this.introTourActive() && !this.introUpgradeStepActive()
  );

  readonly proCoachStepActive = computed(
    () => this.active() && this.kind() === 'pro' && this.currentStep()?.id === 'pro-coach'
  );

  readonly openThemePickerTick = signal(0);
  readonly addTaskStepSkipped = signal(false);

  readonly introAddTaskStepActive = computed(
    () => this.introTourActive() && this.currentStep()?.id === 'add-task'
  );

  readonly introTaskControlsStepActive = computed(
    () => this.introTourActive() && this.currentStep()?.id === 'task-controls'
  );

  readonly addTaskStepActive = computed(() => {
    const stepId = this.currentStep()?.id;
    return !!stepId && ADD_TASK_STEP_IDS.has(stepId);
  });

  readonly taskEntryLocked = computed(() => {
    if (!this.active()) return false;
    if (this.currentStep()?.id === 'pro-add-task') return false;
    return true;
  });

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
    this.resetTourState('intro');
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

  canAdvance(_taskCount = 0): boolean {
    const step = this.currentStep();
    if (step?.id === 'add-task' && this.kind() === 'intro') return true;
    if (!this.addTaskStepActive() || this.addTaskStepSkipped()) return true;
    return _taskCount > 0;
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
    this.resetTourState('intro');
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

  skipAddTaskStep(): void {
    if (this.addTaskStepActive()) {
      this.addTaskStepSkipped.set(true);
      this.next();
    }
  }

  notifyTaskAdded(): void {
    window.setTimeout(() => this.refreshLayout(), 80);
  }

  private beginProTour(): void {
    this.resetTourState('pro');
  }

  private resetTourState(kind: TourKind): void {
    this.kind.set(kind);
    this.stepIndex.set(0);
    this.addTaskStepSkipped.set(false);
    this.active.set(true);
  }

  private isStepReachable(step: TourStep): boolean {
    if (step.placement === 'center' || !step.target) return true;
    if (step.id === 'task-controls') return true;
    return !!document.querySelector(`[data-tour="${step.target}"]`);
  }
}
