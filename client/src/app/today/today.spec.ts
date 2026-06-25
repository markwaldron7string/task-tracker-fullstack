import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { Today } from './today';
import { ProService } from '../pro.service';
import { TaskStore } from '../task-store';

const taskStoreStub = {
  scheduledCount: () => 0,
  overdueTasks: () => [],
  dueTodayTasks: () => [],
  upcomingTasks: () => [],
  todayFocusTasks: () => [],
  todayEstimatedLabel: () => '0m',
  dayCapacityLabel: () => '8h',
  dayCapacityMinutes: () => 480,
  todayCapacityPercent: () => 0,
  isOvercommitted: () => false,
  weekGlance: () => [],
  rollOverdueToToday: () => {},
  lightenToday: () => {},
  setDayCapacityHours: () => {},
  toggleTask: () => {},
  removeTask: () => {},
  editTask: () => {},
  cyclePriority: () => {},
  setDue: () => {},
  cycleEstimate: () => {},
};

describe('Today', () => {
  let component: Today;
  let fixture: ComponentFixture<Today>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Today],
      providers: [
        provideRouter([]),
        { provide: TaskStore, useValue: taskStoreStub },
        { provide: ProService, useValue: { unlocked: signal(false), unlock: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Today);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
