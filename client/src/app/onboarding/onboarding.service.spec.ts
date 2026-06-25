import { TestBed } from '@angular/core/testing';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let storage: Storage;

  beforeEach(() => {
    storage = createStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    storage.clear();

    TestBed.configureTestingModule({});
    service = TestBed.inject(OnboardingService);
  });

  it('should start when onboarding has not completed', () => {
    expect(service.shouldShow()).toBe(true);
    service.start();
    expect(service.active()).toBe(true);
    expect(service.currentStep()?.id).toBe('welcome');
  });

  it('should not start after completion', () => {
    storage.setItem('ttf-onboarding-complete', '1');
    service.start();
    expect(service.active()).toBe(false);
  });

  it('should advance and complete the tour', () => {
    service.start();
    const total = service.steps().length;
    for (let i = 0; i < total - 1; i += 1) {
      service.next();
    }
    service.next();
    expect(service.active()).toBe(false);
    expect(storage.getItem('ttf-onboarding-complete')).toBe('1');
  });

  it('should skip and mark complete', () => {
    service.start();
    service.skip();
    expect(service.active()).toBe(false);
    expect(storage.getItem('ttf-onboarding-complete')).toBe('1');
  });

  it('should omit coach step when Pro is locked', () => {
    expect(service.steps().some(step => step.id === 'coach')).toBe(false);
    expect(service.steps().some(step => step.id === 'upgrade')).toBe(true);
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
