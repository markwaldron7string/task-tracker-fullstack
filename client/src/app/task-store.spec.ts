import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { TaskStore } from './task-store';

describe('TaskStore', () => {
  let service: TaskStore;
  let httpTesting: HttpTestingController;
  let storage: Storage;

  beforeEach(() => {
    storage = createStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage
    });
    storage.clear();
    setNavigatorOnline(true);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    try {
      httpTesting.verify();
    } finally {
      storage.clear();
      setNavigatorOnline(true);
      TestBed.resetTestingModule();
    }
  });

  it('should be created', async () => {
    service = createStore();
    await flushConfig('');
    httpTesting.expectOne('http://localhost:5226/api/tasks').flush([]);

    expect(service).toBeTruthy();
  });

  it('loads tasks from configured API URL', async () => {
    service = createStore();
    await flushConfig('https://api.example.test/api/tasks/');

    const request = httpTesting.expectOne('https://api.example.test/api/tasks');
    request.flush([{
      id: 1,
      title: 'Configured API task',
      done: false,
      sortOrder: 1,
      priority: 'none',
      due: null,
      estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
    }]);
    await settlePromises();

    expect(service.tasks()).toEqual([{
      id: 1,
      title: 'Configured API task',
      done: false,
      pending: false,
      sortOrder: 1,
      priority: 'none',
      due: null,
      estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
    }]);
  });

  it('adds a task through the configured API URL and reloads tasks', async () => {
    service = createStore();
    await flushConfig('https://api.example.test/api/tasks');
    httpTesting.expectOne('https://api.example.test/api/tasks').flush([]);
    await settlePromises();

    service.addTask(' Write frontend tests ');

    const createRequest = httpTesting.expectOne('https://api.example.test/api/tasks');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({
      title: 'Write frontend tests',
      priority: 'none',
      due: null,
      estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
    });
    createRequest.flush({
      id: 4,
      title: 'Write frontend tests',
      done: false,
      sortOrder: 4,
      priority: 'none',
      due: null,
      estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
    });
    await settlePromises();

    httpTesting.expectOne('https://api.example.test/api/tasks').flush([
      {
        id: 4,
        title: 'Write frontend tests',
        done: false,
        sortOrder: 4,
        priority: 'none',
        due: null,
        estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
      }
    ]);
    await settlePromises();

    expect(service.tasks()).toEqual([{
      id: 4,
      title: 'Write frontend tests',
      done: false,
      pending: false,
      sortOrder: 4,
      priority: 'none',
      due: null,
      estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
    }]);
  });

  it('edits a task with a trimmed title through the configured API URL', async () => {
    service = createStore();
    await flushConfig('https://api.example.test/api/tasks');
    httpTesting.expectOne('https://api.example.test/api/tasks').flush([
      {
        id: 4,
        title: 'Write frontend tests',
        done: false,
        sortOrder: 4,
        priority: 'none',
        due: null,
        estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
      }
    ]);
    await settlePromises();

    service.editTask(4, ' Ship frontend tests ');

    const updateRequest = httpTesting.expectOne('https://api.example.test/api/tasks/4');
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body).toEqual({
      title: 'Ship frontend tests',
      done: false,
      priority: 'none',
      due: null,
      estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
    });
    updateRequest.flush({
      id: 4,
      title: 'Ship frontend tests',
      done: false,
      sortOrder: 4,
      priority: 'none',
      due: null,
      estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
    });
    await settlePromises();

    httpTesting.expectOne('https://api.example.test/api/tasks').flush([
      {
        id: 4,
        title: 'Ship frontend tests',
        done: false,
        sortOrder: 4,
        priority: 'none',
        due: null,
        estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
      }
    ]);
    await settlePromises();

    expect(service.tasks()).toEqual([{
      id: 4,
      title: 'Ship frontend tests',
      done: false,
      pending: false,
      sortOrder: 4,
      priority: 'none',
      due: null,
      estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
    }]);
  });

  it('saves new tasks locally when offline and queues them for sync', async () => {
    setNavigatorOnline(false);
    service = createStore();
    await flushConfig('https://api.example.test/api/tasks');

    service.addTask(' Offline task ');

    expect(service.tasks()).toEqual([
      {
        id: -1,
        title: 'Offline task',
        done: false,
        pending: true,
        sortOrder: 10,
        priority: 'none',
        due: null,
        estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
      }
    ]);
    expect(service.pendingChanges()).toBe(1);
    expect(service.syncStatus()).toBe('offline');
    httpTesting.expectNone('https://api.example.test/api/tasks');
  });

  it('restores locally saved tasks before syncing', async () => {
    storage.setItem('ttf-offline-tasks-v1', JSON.stringify([
      {
        id: -1,
        title: 'Saved offline',
        done: false,
        priority: 'none',
        due: null,
        estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
      }
    ]));
    storage.setItem('ttf-sync-queue-v1', JSON.stringify([
      {
        id: 'queued-create',
        type: 'create',
        taskId: -1,
        title: 'Saved offline',
        done: false,
        createdAt: '2026-06-23T00:00:00.000Z'
      }
    ]));
    setNavigatorOnline(false);

    service = createStore();
    await flushConfig('https://api.example.test/api/tasks');

    expect(service.tasks()).toEqual([
      {
        id: -1,
        title: 'Saved offline',
        done: false,
        pending: true,
        sortOrder: -1,
        priority: 'none',
        due: null,
        estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
      }
    ]);
    expect(service.pendingChanges()).toBe(1);
  });

  it('prepares for app refresh by persisting tasks to local storage', async () => {
    service = createStore();
    await flushConfig('https://api.example.test/api/tasks');
    httpTesting.expectOne('https://api.example.test/api/tasks').flush([]);
    await settlePromises();

    setNavigatorOnline(false);
    service.addTask('Persist before refresh');

    await service.prepareForAppRefresh(0);

    expect(storage.getItem('ttf-offline-tasks-v1')).toContain('Persist before refresh');
    httpTesting.expectNone('https://api.example.test/api/tasks');
  });

  function createStore() {
    return TestBed.inject(TaskStore);
  }

  async function flushConfig(tasksApiUrl: string) {
    httpTesting.expectOne('/app-config.json').flush({ tasksApiUrl });
    await settlePromises();
  }

  async function settlePromises() {
    await Promise.resolve();
    await Promise.resolve();
  }

  function setNavigatorOnline(online: boolean) {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: online
    });
  }

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
      setItem: (key: string, value: string) => { values.set(key, value); }
    };
  }
});
