import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProService } from '../pro.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { TaskReminderService } from '../task-reminder.service';
import { TaskItem } from './task-item';

describe('TaskItem', () => {
  let component: TaskItem;
  let fixture: ComponentFixture<TaskItem>;
  const masterEnabled = signal(true);
  const reminderEnabled = signal(false);

  beforeEach(async () => {
    masterEnabled.set(true);
    reminderEnabled.set(false);

    await TestBed.configureTestingModule({
      imports: [TaskItem],
      providers: [
        { provide: ProService, useValue: { unlocked: signal(true) } },
        {
          provide: OnboardingService,
          useValue: {
            introTaskControlsStepActive: () => false,
          },
        },
        {
          provide: TaskReminderService,
          useValue: {
            isMasterEnabled: () => masterEnabled(),
            isEnabled: () => reminderEnabled(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskItem);
    fixture.componentRef.setInput('task', {
      id: 1,
      title: 'Test task',
      done: false,
      sortOrder: 1,
      priority: 'none',
      due: null,
      estimateMinutes: null,
    });
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('mutes the bell when the task reminder is off, even if master reminders are on', () => {
    const bell = fixture.nativeElement.querySelector('.bell-btn') as HTMLButtonElement;

    expect(bell.classList.contains('bell-btn--active')).toBe(false);
    expect(bell.classList.contains('bell-btn--muted')).toBe(true);
  });

  it('lights the bell when the task reminder is on', () => {
    reminderEnabled.set(true);
    fixture.detectChanges();

    const bell = fixture.nativeElement.querySelector('.bell-btn') as HTMLButtonElement;

    expect(bell.classList.contains('bell-btn--active')).toBe(true);
    expect(bell.classList.contains('bell-btn--muted')).toBe(false);
  });
});
