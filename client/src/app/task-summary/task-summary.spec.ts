import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TaskSummary } from './task-summary';
import { TaskStore } from '../task-store';

const taskStoreStub = {
  tasks: () => []
};

describe('TaskSummary', () => {
  let component: TaskSummary;
  let fixture: ComponentFixture<TaskSummary>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskSummary],
      providers: [
        { provide: TaskStore, useValue: taskStoreStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TaskSummary);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
