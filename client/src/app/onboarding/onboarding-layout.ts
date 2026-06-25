import { TourStep } from './onboarding.service';

export interface SpotlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: string;
}

const PAD_TIGHT = 2;
const PAD_DEFAULT = 4;
const PAD_ROOMY = 6;

const ROOMY_TARGETS = new Set(['nav', 'add-task', 'calendar-view', 'today-planning']);

export function resolveTourTarget(root: Element, targetId: string): Element {
  if (targetId === 'theme-picker') {
    return root.querySelector('.trigger') ?? root;
  }
  return root;
}

export function spotlightPadding(targetId: string, rect: DOMRect): number {
  if (ROOMY_TARGETS.has(targetId)) {
    return rect.height > 100 ? PAD_ROOMY : PAD_DEFAULT;
  }
  if (rect.height <= 48 && rect.width <= 240) return PAD_TIGHT;
  return PAD_DEFAULT;
}

export function readBorderRadius(el: HTMLElement): string {
  const radius = getComputedStyle(el).borderRadius;
  return radius && radius !== '0px' ? radius : '8px';
}

export function buildSpotlightBox(
  step: TourStep,
  target: Element,
  viewportPad = 12
): SpotlightBox {
  const rect = target.getBoundingClientRect();
  const pad = spotlightPadding(step.target ?? '', rect);

  return {
    top: Math.max(viewportPad, rect.top - pad),
    left: Math.max(viewportPad, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    radius: readBorderRadius(target as HTMLElement),
  };
}
