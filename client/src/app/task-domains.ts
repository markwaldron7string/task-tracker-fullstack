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

export function isKnownDomain(project: string | null): project is TaskDomain {
  return !!project && (TASK_DOMAINS as readonly string[]).includes(project);
}
