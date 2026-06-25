export const TASK_DOMAINS = ['work', 'home', 'health', 'learning', 'errands'] as const;

export type TaskDomain = (typeof TASK_DOMAINS)[number];

export function normalizeProject(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function projectLabel(project: string | null): string {
  if (!project) return '';
  return project.charAt(0).toUpperCase() + project.slice(1);
}

export function coachPlanProject(label: string): string {
  const slug = label.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  return slug ? `plan:${slug}` : 'plan:coach plan';
}

export function isCoachPlan(project: string | null): boolean {
  return !!project?.startsWith('plan:');
}

export function coachPlanDisplayName(project: string | null): string {
  if (!isCoachPlan(project)) return '';
  const raw = project!.slice('plan:'.length);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
