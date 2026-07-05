import { coachPlanDisplayName, coachPlanProject, isCoachPlan } from './task-domains';
import { countCompletedDayTasks, countOpenDayTasks, Task } from './task-store';

describe('task-domains coach plans', () => {
  it('stores and reads coach plan labels', () => {
    const project = coachPlanProject('30-Day Workout Plan');
    expect(isCoachPlan(project)).toBe(true);
    expect(coachPlanDisplayName(project)).toBe('30-day workout plan');
  });
});

describe('countOpenDayTasks', () => {
  const base: Task = {
    id: 1,
    title: 'Day 1',
    done: false,
    sortOrder: 1,
    priority: 'none',
    due: '2026-06-25',
    estimateMinutes: null,
    project: null,
    recurrence: null,
    checklist: [],
  };

  it('counts checklist items instead of parent tasks', () => {
    const tasks: Task[] = [
      {
        ...base,
        checklist: [
          { id: '1', title: 'A', done: false },
          { id: '2', title: 'B', done: false },
          { id: '3', title: 'C', done: true },
        ],
      },
    ];
    expect(countOpenDayTasks(tasks)).toBe(2);
  });

  it('counts plain tasks without checklists as one item', () => {
    expect(countOpenDayTasks([base])).toBe(1);
  });
});

describe('countCompletedDayTasks', () => {
  const base: Task = {
    id: 1,
    title: 'Day 1',
    done: false,
    sortOrder: 1,
    priority: 'none',
    due: '2026-06-25',
    estimateMinutes: null,
    project: null,
    recurrence: null,
    checklist: [],
  };

  it('counts completed checklist items', () => {
    const tasks: Task[] = [
      {
        ...base,
        checklist: [
          { id: '1', title: 'A', done: true },
          { id: '2', title: 'B', done: false },
          { id: '3', title: 'C', done: true },
        ],
      },
    ];
    expect(countCompletedDayTasks(tasks)).toBe(2);
  });

  it('counts completed plain tasks as one item', () => {
    expect(countCompletedDayTasks([{ ...base, done: true }])).toBe(1);
  });
});
