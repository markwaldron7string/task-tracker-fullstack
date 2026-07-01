import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ProService } from './pro.service';
import { configToTimestamp } from './task-reminder.service';
import { TaskReminderService } from './task-reminder.service';
import { TaskStore } from './task-store';

const MASTER_KEY = 'ttf-reminders-master-v1';

const taskStoreStub = {
  tasks: signal([]),
};

describe('configToTimestamp', () => {
  it('returns the configured local date and time', () => {
    const expected = new Date('2026-06-25T09:00:00');
    expect(
      configToTimestamp({ remindDate: '2026-06-25', remindTime: '09:00' })
    ).toBe(expected.getTime());
  });
});

describe('TaskReminderService', () => {
  let service: TaskReminderService | null = null;
  let storage: Storage;

  beforeEach(() => {
    storage = createStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    storage.clear();
    taskStoreStub.tasks.set([]);

    TestBed.configureTestingModule({
      providers: [
        TaskReminderService,
        { provide: TaskStore, useValue: taskStoreStub },
        { provide: ProService, useValue: { unlocked: signal(true) } },
      ],
    });
  });

  afterEach(() => {
    service?.setMasterEnabled(false);
    service = null;
    storage.clear();
    TestBed.resetTestingModule();
  });

  it('defaults the master reminder toggle to on for new users', () => {
    service = TestBed.inject(TaskReminderService);

    expect(service.isMasterEnabled()).toBe(true);
  });

  it('respects a stored off preference for the master reminder toggle', () => {
    storage.setItem(MASTER_KEY, 'false');
    service = TestBed.inject(TaskReminderService);

    expect(service.isMasterEnabled()).toBe(false);
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
