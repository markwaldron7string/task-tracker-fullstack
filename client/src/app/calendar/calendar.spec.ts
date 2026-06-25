import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { Calendar } from './calendar';
import { ProService } from '../pro.service';
import { TaskStore } from '../task-store';

const taskStoreStub = {
  tasksByDueDate: () => ({}),
  unscheduledActiveTasks: () => [],
  toggleTask: () => {},
  removeTask: () => {},
  editTask: () => {},
  cyclePriority: () => {},
  setDue: () => {},
  cycleEstimate: () => {},
  addTaskOnDate: () => {},
  scheduleToDay: () => {},
};

const proStub = { unlocked: signal(true), unlock: () => {} };

describe('Calendar', () => {
  let component: Calendar;
  let fixture: ComponentFixture<Calendar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Calendar],
      providers: [
        provideRouter([]),
        { provide: TaskStore, useValue: taskStoreStub },
        { provide: ProService, useValue: proStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Calendar);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
