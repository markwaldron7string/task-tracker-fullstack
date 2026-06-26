import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { OnboardingService } from './onboarding.service';
import { ProService } from '../pro.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let storage: Storage;
  let proUnlocked: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    storage = createStorage();
    proUnlocked = signal(false);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    storage.clear();

    TestBed.configureTestingModule({
      providers: [{ provide: ProService, useValue: { unlocked: proUnlocked } }],
    });
    service = TestBed.inject(OnboardingService);
  });

  it('should start intro when onboarding has not completed', () => {
    expect(service.shouldShowIntro()).toBe(true);
    service.startIntro();
    expect(service.active()).toBe(true);
    expect(service.currentStep()?.id).toBe('welcome');
  });

  it('should not start intro after completion', () => {
    storage.setItem('ttf-onboarding-complete', '1');
    service.startIntro();
    expect(service.active()).toBe(false);
  });

  it('should advance and complete the intro tour', () => {
    service.startIntro();
    const total = service.steps().length;
    for (let i = 0; i < total - 1; i += 1) {
      service.next();
    }
    service.next();
    expect(service.active()).toBe(false);
    expect(storage.getItem('ttf-onboarding-complete')).toBe('1');
  });

  it('should start pro tour when unlocked and not yet seen', () => {
    proUnlocked.set(true);
    storage.setItem('ttf-onboarding-complete', '1');

    service.startPro();
    expect(service.active()).toBe(true);
    expect(service.isProTour()).toBe(true);
    expect(service.currentStep()?.id).toBe('pro-welcome');
  });

  it('should mark pro tour complete separately from intro', () => {
    proUnlocked.set(true);
    storage.setItem('ttf-onboarding-complete', '1');
    service.startPro();
    service.skip();

    expect(storage.getItem('ttf-pro-onboarding-complete')).toBe('1');
    expect(service.shouldShowPro()).toBe(false);
  });

  it('should omit upgrade step when Pro is locked', () => {
    expect(service.steps().some(step => step.id === 'upgrade')).toBe(true);
  });

  it('should block advance on add-task step until a task exists', () => {
    service.startIntro();
    while (service.currentStep()?.id !== 'add-task') {
      service.next();
    }
    expect(service.canAdvance(0)).toBe(false);
    expect(service.canAdvance(1)).toBe(true);
  });

  it('should allow skipping the add-task step', () => {
    service.startIntro();
    while (service.currentStep()?.id !== 'add-task') {
      service.next();
    }
    service.skipAddTaskStep();
    expect(service.currentStep()?.id).not.toBe('add-task');
    expect(service.canAdvance(0)).toBe(true);
  });

  it('should include pro notifications step in pro tour', () => {
    proUnlocked.set(true);
    storage.setItem('ttf-onboarding-complete', '1');
    service.startPro();
    expect(service.steps().some(step => step.id === 'pro-notifications')).toBe(true);
  });
});

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}
