import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { AppUpdateService } from './app-update.service';
import { TaskStore } from './task-store';

const swUpdateMock = {
  isEnabled: true,
  versionUpdates: new Subject(),
  unrecoverable: new Subject(),
  checkForUpdate: () => Promise.resolve(false),
  activateUpdate: () => Promise.resolve(true),
};

describe('AppUpdateService', () => {
  let service: AppUpdateService;
  let storage: Storage;
  let prepareForAppRefresh: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = createStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    });
    storage.clear();
    storage.setItem('ttf-offline-tasks-v1', JSON.stringify([{ id: 1, title: 'Keep me', done: false }]));

    prepareForAppRefresh = vi.fn().mockResolvedValue(undefined);
    reload = vi.fn(() => {
      throw new Error('reload');
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    TestBed.configureTestingModule({
      providers: [
        AppUpdateService,
        { provide: SwUpdate, useValue: swUpdateMock },
        {
          provide: TaskStore,
          useValue: { prepareForAppRefresh },
        },
      ],
    });

    service = TestBed.inject(AppUpdateService);
  });

  it('flushes tasks and keeps local data on update refresh', async () => {
    await expect(service.refresh()).rejects.toThrow('reload');

    expect(prepareForAppRefresh).toHaveBeenCalled();
    expect(storage.getItem('ttf-offline-tasks-v1')).toContain('Keep me');
  });

  it('clears persisted data on manual refresh', async () => {
    await expect(service.refresh({ clearUserData: true })).rejects.toThrow('reload');

    expect(prepareForAppRefresh).not.toHaveBeenCalled();
    expect(storage.getItem('ttf-offline-tasks-v1')).toBeNull();
  });

  function createStorage(): Storage {
    const values = new Map<string, string>();

    return {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
  }
});
