export type ProFeatureId = 'calendar' | 'custom-themes' | 'ai-coach' | 'smart-scheduling' | 'realistic-day';

export interface ProFeature {
  id: ProFeatureId;
  title: string;
  description: string;
  /** Shown on the upgrade page as a headline benefit. */
  highlight?: boolean;
}

export const PRO_PRICE_LABEL = '$2.99';
export const PRO_TAGLINE = 'One-time unlock — no subscription.';

export const PRO_FEATURES: ProFeature[] = [
  {
    id: 'ai-coach',
    title: 'AI Planning Coach',
    description: 'A built-in assistant that reads your tasks and suggests what to focus on, when to schedule, and how to lighten an overcommitted day.',
    highlight: true,
  },
  {
    id: 'calendar',
    title: 'Calendar planning',
    description: 'Month and week views, drag tasks between days, and a day panel for focused scheduling.',
    highlight: true,
  },
  {
    id: 'smart-scheduling',
    title: 'Smart scheduling nudges',
    description: 'Overdue roll-forward, capacity warnings, one-tap “lighten today,” and unscheduled-task prompts.',
  },
  {
    id: 'realistic-day',
    title: 'Realistic Day tuning',
    description: 'Set your workday length, see a 7-day load preview, and keep capacity math honest.',
  },
  {
    id: 'custom-themes',
    title: 'Custom themes',
    description: 'Build your own accent on Light, Dark, or Neon — make the app feel like yours.',
  },
];

export function proFeature(id: ProFeatureId): ProFeature {
  const feature = PRO_FEATURES.find(entry => entry.id === id);
  if (!feature) throw new Error(`Unknown Pro feature: ${id}`);
  return feature;
}
