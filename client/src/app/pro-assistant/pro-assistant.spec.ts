import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { ProAssistant } from './pro-assistant';
import { CoachApiService } from '../coach-api.service';
import { ProService } from '../pro.service';
import { TaskStore } from '../task-store';

const taskStoreStub = {
  overdueTasks: () => [],
  dueTodayTasks: () => [{ title: 'Focus task' }],
  upcomingTasks: () => [],
  unscheduledActiveTasks: () => [],
  activeEnrichedTasks: () => [],
  isOvercommitted: () => false,
  todayEstimatedLabel: () => '0m',
  dayCapacityLabel: () => '8h',
  rollOverdueToToday: () => {},
  applySchedule: () => 0,
};

describe('ProAssistant', () => {
  let fixture: ComponentFixture<ProAssistant>;
  let coachApi: { chat: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    coachApi = {
      chat: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ProAssistant],
      providers: [
        provideRouter([]),
        { provide: TaskStore, useValue: taskStoreStub },
        { provide: ProService, useValue: { unlocked: signal(true), unlock: () => {} } },
        { provide: CoachApiService, useValue: coachApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProAssistant);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('uses the coach API when available', async () => {
    coachApi.chat.mockResolvedValue({
      text: 'Start with Focus task.',
      source: 'ai',
      schedule: [],
    });

    const input = document.createElement('input');
    input.value = 'What should I focus on today?';

    await fixture.componentInstance['askCoach'](input);

    expect(coachApi.chat).toHaveBeenCalled();
    expect(fixture.componentInstance['chatReply']()).toContain('Focus task');
    expect(fixture.componentInstance['chatSource']()).toBe('ai');
    expect(fixture.componentInstance['chatFromClient']()).toBe(false);
  });

  it('falls back locally when the coach API fails', async () => {
    coachApi.chat.mockResolvedValue(null);

    const input = document.createElement('input');
    input.value = 'What should I focus on today?';

    await fixture.componentInstance['askCoach'](input);

    expect(fixture.componentInstance['chatReply']()).toContain('due today');
    expect(fixture.componentInstance['chatFromClient']()).toBe(true);
  });
});
