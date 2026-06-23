import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TaskSummary } from './task-summary';

describe('TaskSummary', () => {
  let component: TaskSummary;
  let fixture: ComponentFixture<TaskSummary>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskSummary],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskSummary);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
