import { TourStep } from './onboarding.service';

export interface SpotlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: string;
}

const PAD_TIGHT = 3;
const PAD_DEFAULT = 4;
const PAD_ROOMY = 6;
const PAD_THEME = 5;

const ROOMY_TARGETS = new Set(['nav', 'add-task', 'calendar-view', 'today-planning']);

export function resolveTourTarget(root: Element, targetId: string): Element {
  if (targetId === 'theme-picker') {
    return root;
  }
  return root;
}

export function spotlightPadding(targetId: string, rect: DOMRect): number {
  if (targetId === 'theme-picker') return PAD_THEME;
  if (targetId === 'first-task-actions') return PAD_TIGHT;
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

function unionElementRects(elements: Element[]): DOMRect | null {
  if (elements.length === 0) return null;
  let rect = elements[0].getBoundingClientRect();
  for (let i = 1; i < elements.length; i += 1) {
    rect = unionDomRects(rect, elements[i].getBoundingClientRect());
  }
  return rect;
}

/** Exact viewport box for a measured rect — no clamping that can shift the highlight. */
export function boxFromRect(rect: DOMRect, pad: number, radius: string): SpotlightBox {
  return {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    radius,
  };
}

function buildAddTaskSpotlight(root: Element): SpotlightBox {
  const controls = [
    root.querySelector('.task-input'),
    root.querySelector('.btn-primary'),
  ].filter((el): el is Element => !!el);
  const rect = unionElementRects(controls) ?? root.getBoundingClientRect();
  return boxFromRect(rect, PAD_DEFAULT, readBorderRadius(root as HTMLElement));
}

function buildTaskActionsSpotlight(root: Element): SpotlightBox {
  const host = root.closest('app-task-item') ?? root;
  const buttons = [
    ...host.querySelectorAll('.task-actions .bell-btn, .task-actions .action-btn'),
  ];
  const rect = unionElementRects(buttons) ?? root.getBoundingClientRect();
  return boxFromRect(rect, PAD_TIGHT, '8px');
}

function buildNavSpotlight(root: Element): SpotlightBox {
  const links = [...root.querySelectorAll('a')];
  const rect = unionElementRects(links) ?? root.getBoundingClientRect();
  return boxFromRect(rect, PAD_DEFAULT, readBorderRadius(root as HTMLElement));
}

export function buildThemePickerSpotlight(root: Element): SpotlightBox | null {
  const trigger = root.querySelector('.trigger') as HTMLElement | null;
  if (!trigger) return null;

  let rect = trigger.getBoundingClientRect();
  const panel = root.querySelector('.panel') as HTMLElement | null;
  if (panel) {
    rect = unionDomRects(rect, panel.getBoundingClientRect());
  }

  const radiusEl = panel ?? trigger;
  return boxFromRect(rect, PAD_THEME, readBorderRadius(radiusEl));
}

export function buildSpotlightBox(step: TourStep, target: Element): SpotlightBox {
  if (step.target === 'theme-picker') {
    const themeBox = buildThemePickerSpotlight(target);
    if (themeBox) return themeBox;
  }

  if (step.target === 'add-task') {
    return buildAddTaskSpotlight(target);
  }

  if (step.target === 'first-task-actions') {
    return buildTaskActionsSpotlight(target);
  }

  if (step.target === 'nav') {
    return buildNavSpotlight(target);
  }

  const rect = target.getBoundingClientRect();
  const pad = spotlightPadding(step.target ?? '', rect);

  if (step.target === 'upgrade') {
    return boxFromRect(rect, pad, '999px');
  }

  return boxFromRect(rect, pad, readBorderRadius(target as HTMLElement));
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

/** Pin the tour card just below the sticky header with the arrow aimed at the target. */
export function computeHeaderPinnedFlagPosition(
  targetRect: DOMRect,
  headerBottom: number,
  flagWidth: number,
  viewportPad = 12,
  gap = 0
): { top: number; left: number; arrowX: number; placement: 'bottom' | 'top' } {
  const vw = window.innerWidth;
  const flagW = Math.min(flagWidth, vw - viewportPad * 2);
  const top = headerBottom + gap;
  const left = Math.max(viewportPad, Math.min(vw / 2 - flagW / 2, vw - flagW - viewportPad));
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const arrowX = Math.min(
    Math.max(targetCenterX - left, FLAG_ARROW_INSET),
    flagW - FLAG_ARROW_INSET
  );
  const placement: 'bottom' | 'top' = targetRect.top < top ? 'bottom' : 'top';
  return { top, left, arrowX, placement };
}

/** Place the tour card immediately above a target while aiming down at it. */
export function computeAboveAnchorFlagPosition(
  targetRect: DOMRect,
  flagWidth: number,
  flagHeight: number,
  viewportPad = 12,
  gap = 44
): { top: number; left: number; arrowX: number; placement: 'top' } {
  const vw = window.innerWidth;
  const flagW = Math.min(flagWidth, vw - viewportPad * 2);
  const top = Math.max(targetRect.top - flagHeight - gap, viewportPad);
  let left = targetRect.left + targetRect.width / 2 - flagW / 2;
  left = Math.min(Math.max(left, viewportPad), vw - flagW - viewportPad);

  const targetCenterX = targetRect.left + targetRect.width / 2;
  const arrowX = Math.min(
    Math.max(targetCenterX - left, FLAG_ARROW_INSET),
    flagW - FLAG_ARROW_INSET
  );

  return { top, left, arrowX, placement: 'top' };
}
