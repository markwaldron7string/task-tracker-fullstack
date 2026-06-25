import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TaskEditDialog } from './task-edit-dialog';

describe('TaskEditDialog', () => {
  let fixture: ComponentFixture<TaskEditDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskEditDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskEditDialog);
    fixture.componentRef.setInput('task', {
      id: 1,
      title: 'Test task',
      done: false,
      priority: 'none',
      due: null,
      estimateMinutes: null,
      project: null,
      recurrence: null,
      checklist: [],
    });
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
