import { coachPlanDisplayName, isCoachPlan } from './task-domains';
import { Task } from './task-store';

export interface DayTaskGroup {
  key: string;
  label: string | null;
  tasks: Task[];
}

export function buildDayTaskGroups(tasks: Task[]): DayTaskGroup[] {
  const byPlan = new Map<string, Task[]>();
  const ungrouped: Task[] = [];

  for (const task of tasks) {
    if (isCoachPlan(task.project)) {
      const key = task.project!;
      const group = byPlan.get(key) ?? [];
      group.push(task);
      byPlan.set(key, group);
    } else {
      ungrouped.push(task);
    }
  }

  const groups: DayTaskGroup[] = [];
  for (const [key, planTasks] of [...byPlan.entries()].sort((a, b) =>
    coachPlanDisplayName(a[0]).localeCompare(coachPlanDisplayName(b[0]))
  )) {
    groups.push({ key, label: coachPlanDisplayName(key), tasks: planTasks });
  }

  if (ungrouped.length > 0) {
    groups.push({
      key: '__other__',
      label: groups.length > 0 ? 'Other tasks' : null,
      tasks: ungrouped,
    });
  }

  return groups;
}

export function formatDayLabel(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function dayHasChecklistTasks(tasks: Task[]): boolean {
  return tasks.some(task => task.checklist.length > 0);
}
