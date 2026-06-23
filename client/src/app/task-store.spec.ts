import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { TaskStore } from './task-store';

describe('TaskStore', () => {
  let service: TaskStore;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(TaskStore);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    httpTesting.expectOne('/app-config.json').flush({ tasksApiUrl: '' });
    httpTesting.expectOne('http://localhost:5226/api/tasks').flush([]);

    expect(service).toBeTruthy();
  });

  it('loads tasks from configured API URL', () => {
    httpTesting.expectOne('/app-config.json').flush({
      tasksApiUrl: 'https://api.example.test/api/tasks/'
    });

    const request = httpTesting.expectOne('https://api.example.test/api/tasks');
    request.flush([{ id: 1, title: 'Configured API task', done: false }]);

    expect(service.tasks()).toEqual([{ id: 1, title: 'Configured API task', done: false }]);
  });

  it('adds a task through the configured API URL and reloads tasks', () => {
    httpTesting.expectOne('/app-config.json').flush({
      tasksApiUrl: 'https://api.example.test/api/tasks'
    });
    httpTesting.expectOne('https://api.example.test/api/tasks').flush([]);

    service.addTask(' Write frontend tests ');

    const createRequest = httpTesting.expectOne('https://api.example.test/api/tasks');
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.body).toEqual({ title: 'Write frontend tests' });
    createRequest.flush({ id: 4, title: 'Write frontend tests', done: false });

    httpTesting.expectOne('https://api.example.test/api/tasks').flush([
      { id: 4, title: 'Write frontend tests', done: false }
    ]);

    expect(service.tasks()).toEqual([{ id: 4, title: 'Write frontend tests', done: false }]);
  });

  it('edits a task with a trimmed title through the configured API URL', () => {
    httpTesting.expectOne('/app-config.json').flush({
      tasksApiUrl: 'https://api.example.test/api/tasks'
    });
    httpTesting.expectOne('https://api.example.test/api/tasks').flush([
      { id: 4, title: 'Write frontend tests', done: false }
    ]);

    service.editTask(4, ' Ship frontend tests ');

    const updateRequest = httpTesting.expectOne('https://api.example.test/api/tasks/4');
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body).toEqual({ title: 'Ship frontend tests', done: false });
    updateRequest.flush({ id: 4, title: 'Ship frontend tests', done: false });

    httpTesting.expectOne('https://api.example.test/api/tasks').flush([
      { id: 4, title: 'Ship frontend tests', done: false }
    ]);

    expect(service.tasks()).toEqual([{ id: 4, title: 'Ship frontend tests', done: false }]);
  });
});
