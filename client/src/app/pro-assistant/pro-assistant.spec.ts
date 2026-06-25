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
  openDueTodayCount: () => 1,
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
      overview: null,
      awaitingReply: false,
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

  it('shows a reply arrow when the coach asks a follow-up question', async () => {
    coachApi.chat.mockResolvedValue({
      text: "I'll create a 7-day keto diet plan for you. Just let me know if you're ready for me to add it to your calendar!",
      source: 'ai',
      schedule: [],
      overview: null,
      awaitingReply: false,
    });

    fixture.componentInstance['open'].set(true);
    const input = document.createElement('input');
    input.value = 'keto diet plan';

    await fixture.componentInstance['askCoach'](input);
    fixture.detectChanges();

    expect(fixture.componentInstance['awaitingReply']()).toBe(true);
    const sendButton = fixture.nativeElement.querySelector('.coach-send') as HTMLButtonElement;
    expect(sendButton.getAttribute('aria-label')).toBe('Send reply');
    expect(sendButton.querySelector('.coach-send-arrow svg')).toBeTruthy();
  });

  it('blocks schedules for fresh vague asks even when the API returns one', async () => {
    coachApi.chat.mockResolvedValue({
      text: 'Here is your personalized task plan for the next 7 days.',
      source: 'ai',
      schedule: [{ due: '2026-06-25', title: 'Day 1 – Lower body workout', checklist: [] }],
      overview: 'A workout plan.',
      awaitingReply: false,
    });

    fixture.componentInstance['open'].set(true);
    const input = document.createElement('input');
    input.value = 'make a plan';

    await fixture.componentInstance['askCoach'](input);
    fixture.detectChanges();

    expect(fixture.componentInstance['scheduleProposal']()).toBeNull();
    expect(fixture.componentInstance['awaitingReply']()).toBe(true);
    expect(fixture.componentInstance['chatReply']()).toContain('?');
    expect(coachApi.chat).toHaveBeenCalledWith('make a plan', expect.anything(), []);
  });
});
