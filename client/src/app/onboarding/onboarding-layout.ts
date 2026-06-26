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
const PAD_THEME = 5;

const ROOMY_TARGETS = new Set(['nav', 'add-task', 'calendar-view', 'today-planning']);
const COMPACT_TARGETS = new Set(['first-task-actions']);

export function resolveTourTarget(root: Element, targetId: string): Element {
  if (targetId === 'theme-picker') {
    return root;
  }
  return root;
}

export function spotlightPadding(targetId: string, rect: DOMRect): number {
  if (targetId === 'theme-picker') return PAD_THEME;
  if (COMPACT_TARGETS.has(targetId)) return PAD_DEFAULT;
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

export function unionDomRects(a: DOMRect, b: DOMRect): DOMRect {
  const top = Math.min(a.top, b.top);
  const left = Math.min(a.left, b.left);
  const right = Math.max(a.right, b.right);
  const bottom = Math.max(a.bottom, b.bottom);
  return new DOMRect(left, top, right - left, bottom - top);
}

export function buildThemePickerSpotlight(root: Element, viewportPad = 12): SpotlightBox | null {
  const trigger = root.querySelector('.trigger') as HTMLElement | null;
  if (!trigger) return null;

  let rect = trigger.getBoundingClientRect();
  const panel = root.querySelector('.panel') as HTMLElement | null;
  if (panel) {
    rect = unionDomRects(rect, panel.getBoundingClientRect());
  }

  const pad = PAD_THEME;
  const radiusEl = panel ?? trigger;

  return {
    top: Math.max(viewportPad, rect.top - pad),
    left: Math.max(viewportPad, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    radius: readBorderRadius(radiusEl),
  };
}

export function buildSpotlightBox(
  step: TourStep,
  target: Element,
  viewportPad = 12
): SpotlightBox {
  if (step.target === 'theme-picker') {
    const themeBox = buildThemePickerSpotlight(target, viewportPad);
    if (themeBox) return themeBox;
  }

  const rect = target.getBoundingClientRect();

  if (step.target === 'nav') {
    // Extend spotlight to viewport top so the full sticky header is captured.
    // On mobile, backdrop-filter on the header can bleed through a partial scrim,
    // making the first header row appear un-dimmed. Covering from y=0 makes it intentional.
    return {
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: rect.bottom + PAD_DEFAULT,
      radius: '0px',
    };
  }

  const pad = spotlightPadding(step.target ?? '', rect);

  return {
    top: Math.max(viewportPad, rect.top - pad),
    left: Math.max(viewportPad, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    radius: readBorderRadius(target as HTMLElement),
  };
}

export const FLAG_ARROW_INSET = 28;

/** Position the tour card below a spotlight box (used for the theme step). */
export function computeThemeStepFlagPosition(
  box: SpotlightBox,
  flagWidth: number,
  flagHeight: number,
  viewportPad = 12,
  gap = 14
): { top: number; left: number; arrowX: number; placement: 'bottom' } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const flagW = Math.min(flagWidth, vw - viewportPad * 2);

  let top = box.top + box.height + gap;
  let left = box.left + box.width / 2 - flagW / 2;
  left = Math.min(Math.max(left, viewportPad), vw - flagW - viewportPad);
  top = Math.min(Math.max(top, viewportPad), vh - flagHeight - viewportPad);

  const targetCenterX = box.left + box.width / 2;
  const arrowX = Math.min(
    Math.max(targetCenterX - left, FLAG_ARROW_INSET),
    flagW - FLAG_ARROW_INSET
  );

  return { top, left, arrowX, placement: 'bottom' };
}
