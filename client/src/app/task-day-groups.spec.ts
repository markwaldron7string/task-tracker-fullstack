import { coachPlanProject } from './task-domains';
import { buildDayTaskGroups } from './task-day-groups';
import { Task } from './task-store';

describe('buildDayTaskGroups', () => {
  const base: Task = {
    id: 1,
    title: 'Task',
    done: false,
    priority: 'none',
    due: '2026-06-25',
    estimateMinutes: null,
    project: null,
    recurrence: null,
    checklist: [{ id: 'a', title: 'Step', done: false }],
  };

  it('groups coach plans by project and sorts by display name', () => {
    const tasks = [
      { ...base, id: 1, title: 'Diet day', project: coachPlanProject('Diet plan') },
      { ...base, id: 2, title: 'Workout day', project: coachPlanProject('Workout plan') },
    ];

    const groups = buildDayTaskGroups(tasks);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Diet plan');
    expect(groups[1].label).toBe('Workout plan');
  });

  it('puts non-coach tasks in Other tasks when plans exist', () => {
    const tasks = [
      { ...base, id: 1, project: coachPlanProject('Workout plan') },
      { ...base, id: 2, title: 'Errand', project: 'personal' },
    ];

    const groups = buildDayTaskGroups(tasks);
    expect(groups).toHaveLength(2);
    expect(groups[1].key).toBe('__other__');
    expect(groups[1].label).toBe('Other tasks');
  });

  it('omits Other tasks label when only ungrouped tasks exist', () => {
    const groups = buildDayTaskGroups([{ ...base, id: 1, project: 'personal' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
  });
});
