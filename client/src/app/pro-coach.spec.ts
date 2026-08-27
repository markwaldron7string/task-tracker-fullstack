import {
  buildCoachSuggestions,
  answerCoachQuestion,
  buildLocalOverview,
  buildLocalSchedule,
  buildLocalGenericPlan,
  buildLocalWellnessPlan,
  buildLocalWorkoutPlan,
  buildPlanSummaryTag,
  buildClarifyingReply,
  isCoachAwaitingReply,
  isScheduleRequest,
  isVagueCoachInput,
  reviseLocalSchedule,
  CoachTaskSnapshot,
  CoachChatTurn,
} from './pro-coach';

const baseSnapshot: CoachTaskSnapshot = {
  overdueCount: 0,
  dueTodayCount: 0,
  upcomingCount: 0,
  unscheduledCount: 0,
  isOvercommitted: false,
  todayEstimatedLabel: '0m',
  dayCapacityLabel: '8h',
  topOverdueTitles: [],
  topUnscheduledTitles: [],
  highPriorityOpenCount: 0,
};

describe('pro-coach', () => {
  it('returns a default suggestion when the list is empty', () => {
    const suggestions = buildCoachSuggestions(baseSnapshot);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].id).toBe('empty');
  });

  it('surfaces overdue guidance', () => {
    const suggestions = buildCoachSuggestions({
      ...baseSnapshot,
      overdueCount: 2,
      topOverdueTitles: ['Taxes'],
    });
    expect(suggestions.some(item => item.id === 'overdue')).toBe(true);
  });

  it('offers lighten-today when overcommitted', () => {
    const suggestions = buildCoachSuggestions({
      ...baseSnapshot,
      isOvercommitted: true,
      todayEstimatedLabel: '10h',
      dayCapacityLabel: '8h',
    });
    expect(suggestions.some(item => item.actionType === 'lighten-today')).toBe(true);
  });

  it('answers focus questions using task snapshot', () => {
    const reply = answerCoachQuestion('What should I focus on today?', {
      ...baseSnapshot,
      dueTodayCount: 3,
      isOvercommitted: true,
      dayCapacityLabel: '8h',
    });
    expect(reply.text).toContain('3 due today');
  });

  it('detects schedule intent', () => {
    expect(isScheduleRequest('Build a schedule for this week')).toBe(true);
    expect(isScheduleRequest('30 day workout plan')).toBe(true);
    expect(isScheduleRequest('build me something')).toBe(true);
    expect(isScheduleRequest('make a plan')).toBe(true);
    expect(isScheduleRequest('What should I focus on today?')).toBe(false);
  });

  it('asks clarifying questions only for bare help', () => {
    expect(isVagueCoachInput('help me')).toBe(true);
    expect(isVagueCoachInput('make a plan')).toBe(false);
    expect(isVagueCoachInput('build me something')).toBe(false);
    expect(buildClarifyingReply('help me')).toContain('?');
    expect(isCoachAwaitingReply(buildClarifyingReply('help me'))).toBe(true);
    expect(isCoachAwaitingReply("Just let me know if you're ready for me to add it to your calendar!")).toBe(true);
    expect(isVagueCoachInput('30 day mental health plan')).toBe(false);
  });

  it('treats confirmation as schedule when history mentions a plan', () => {
    const history: CoachChatTurn[] = [
      { role: 'user', content: 'Create a 30 day workout plan' },
      { role: 'assistant', content: 'Here is a workout plan you can apply to your calendar.' },
    ];
    expect(isScheduleRequest('ok', history)).toBe(true);
    expect(isScheduleRequest('ok', [])).toBe(false);
  });

  it('builds a generic plan when asked to build something', () => {
    const schedule = buildLocalGenericPlan('build me something');
    expect(schedule).toHaveLength(7);
    expect(schedule[0].title).toContain('Day 1');
    expect(schedule[0].checklist?.length).toBeGreaterThan(2);
  });

  it('builds a local workout plan with new tasks', () => {
    const schedule = buildLocalWorkoutPlan('30 day workout plan with meal plan');
    expect(schedule).toHaveLength(30);
    expect(schedule[0].title).toContain('Workout Day');
    expect(schedule[0].taskId).toBeUndefined();
    expect(schedule[0].checklist?.length).toBeGreaterThan(3);
  });

  it('builds a local schedule for unscheduled tasks', () => {
    const schedule = buildLocalSchedule([
      { id: 1, title: 'Alpha', due: null, priority: 'high' },
      { id: 2, title: 'Beta', due: '2026-07-01', priority: 'none' },
      { id: 3, title: 'Gamma', due: null, priority: 'low' },
    ]);
    expect(schedule).toHaveLength(2);
    expect(schedule.map(item => item.taskId)).toEqual([1, 3]);
  });

  it('builds a local wellness plan with overview copy', () => {
    const schedule = buildLocalWellnessPlan('30 day mental health plan');
    expect(schedule).toHaveLength(30);
    expect(schedule[0].title).toContain('Morning Mindfulness');
    expect(buildPlanSummaryTag(schedule, '30 day mental health plan')).toContain('mental health');
    expect(buildLocalOverview(schedule, '30 day mental health plan')).toContain('mindfulness');
  });

  it('revises a local schedule when asked to shorten tasks', () => {
    const schedule = buildLocalWellnessPlan('5 day mental health plan');
    const revised = reviseLocalSchedule('Shorten daily tasks', schedule);
    expect(revised[0].checklist?.length).toBeLessThan(schedule[0].checklist!.length);
  });
});
