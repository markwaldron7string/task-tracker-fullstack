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
});
