import { TourStep } from './onboarding.service';

export interface SpotlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: string;
}

export interface FlagLayout {
  top: number;
  left: number;
  arrowX: number;
  placement: 'top' | 'bottom';
}

export interface TourPointer {
  x: number;
  y: number;
  rotation: number;
}

const PAD_TIGHT = 3;
const PAD_UPGRADE = 1;
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
  if (targetId === 'upgrade') return PAD_UPGRADE;
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
    ...host.querySelectorAll('.task-actions .action-btn'),
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Place the card near a target, preferring above so the feature stays visible. */
export function computeCardNearTarget(
  targetRect: DOMRect,
  flagWidth: number,
  flagHeight: number,
  viewportPad = 12,
  gap = 18,
  prefer: 'above' | 'below' = 'above'
): FlagLayout {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const flagW = Math.min(flagWidth, vw - viewportPad * 2);

  const aboveTop = targetRect.top - flagHeight - gap;
  const belowTop = targetRect.bottom + gap;

  let top: number;
  let placement: 'top' | 'bottom';

  if (prefer === 'below' && belowTop + flagHeight <= vh - viewportPad) {
    top = belowTop;
    placement = 'bottom';
  } else if (prefer === 'above' && aboveTop >= viewportPad) {
    top = aboveTop;
    placement = 'top';
  } else if (belowTop + flagHeight <= vh - viewportPad) {
    top = belowTop;
    placement = 'bottom';
  } else {
    top = Math.max(viewportPad, aboveTop);
    placement = 'top';
  }

  let left = targetRect.left + targetRect.width / 2 - flagW / 2;
  left = clamp(left, viewportPad, vw - flagW - viewportPad);

  const targetCenterX = targetRect.left + targetRect.width / 2;
  const arrowX = clamp(targetCenterX - left, FLAG_ARROW_INSET, flagW - FLAG_ARROW_INSET);

  return { top, left, arrowX, placement };
}

/** Position the tour card below a spotlight box (theme step). */
export function computeThemeStepFlagPosition(
  box: SpotlightBox,
  flagWidth: number,
  flagHeight: number,
  viewportPad = 12,
  gap = 14
): FlagLayout {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const flagW = Math.min(flagWidth, vw - viewportPad * 2);

  let top = box.top + box.height + gap;
  let left = box.left + box.width / 2 - flagW / 2;
  left = clamp(left, viewportPad, vw - flagW - viewportPad);
  top = clamp(top, viewportPad, vh - flagHeight - viewportPad);

  const targetCenterX = box.left + box.width / 2;
  const arrowX = clamp(targetCenterX - left, FLAG_ARROW_INSET, flagW - FLAG_ARROW_INSET);

  return { top, left, arrowX, placement: 'bottom' };
}

/** Pin the card just below the header/nav with the arrow aimed at the target. */
export function computeHeaderPinnedFlagPosition(
  targetRect: DOMRect,
  headerBottom: number,
  flagWidth: number,
  viewportPad = 12,
  gap = 8
): FlagLayout {
  const vw = window.innerWidth;
  const flagW = Math.min(flagWidth, vw - viewportPad * 2);
  const top = headerBottom + gap;
  const left = clamp(vw / 2 - flagW / 2, viewportPad, vw - flagW - viewportPad);
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const arrowX = clamp(targetCenterX - left, FLAG_ARROW_INSET, flagW - FLAG_ARROW_INSET);
  const placement: 'bottom' | 'top' = targetRect.top < top ? 'bottom' : 'top';
  return { top, left, arrowX, placement };
}

/** Animated pointer between the card edge and the highlighted target. */
export function isMobileTour(): boolean {
  return window.matchMedia('(max-width: 768px)').matches;
}

export function isCoarsePointer(): boolean {
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

export function isKeyboardOpen(): boolean {
  const vv = window.visualViewport;
  if (!vv) return false;
  return vv.height < window.innerHeight * 0.72;
}

export function getVisualViewportTop(): number {
  return window.visualViewport?.offsetTop ?? 0;
}

export function getVisualViewportHeight(): number {
  const vv = window.visualViewport;
  return vv ? vv.height : window.innerHeight;
}

export function computeViewportTopFlagPosition(
  flagWidth: number,
  topPad = 12,
): FlagLayout {
  const viewportPad = 12;
  const top = getVisualViewportTop() + topPad;
  const left = Math.max(
    viewportPad,
    Math.min(
      window.innerWidth - flagWidth - viewportPad,
      (window.innerWidth - flagWidth) / 2,
    ),
  );
  return { top, left, arrowX: flagWidth / 2, placement: 'bottom' };
}

export function computeTourPointer(
  flag: FlagLayout,
  flagWidth: number,
  flagHeight: number,
  targetRect: DOMRect
): TourPointer {
  const tipX = flag.left + flag.arrowX;
  const tipY =
    flag.placement === 'top'
      ? flag.top + flagHeight
      : flag.top;

  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  const dx = targetCenterX - tipX;
  const dy = targetCenterY - tipY;
  const dist = Math.hypot(dx, dy);
  if (dist < 8) {
    return { x: tipX, y: tipY, rotation: 0 };
  }
  const travel = Math.min(dist * 0.55, 72);

  const x = tipX + (dx / dist) * travel;
  const y = tipY + (dy / dist) * travel;
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI + 90;

  return { x, y, rotation };
}

/** Place a downward arrow centered just above a highlighted target. */
export function computeDownwardPointerAboveTarget(
  targetRect: DOMRect,
  gap = 28,
): TourPointer {
  const x = targetRect.left + targetRect.width / 2;
  const y = targetRect.top - gap;
  // Triangle uses border-bottom, so its default tip points up; flip to aim down.
  return { x, y, rotation: 180 };
}

/** Place an upward arrow centered just below a highlighted target. */
export function computeUpwardPointerBelowTarget(
  targetRect: DOMRect,
  gap = 14,
): TourPointer {
  const x = targetRect.left + targetRect.width / 2;
  const y = targetRect.bottom + gap;
  return { x, y, rotation: 0 };
}

export function spotlightDomRect(box: SpotlightBox): DOMRect {
  return new DOMRect(box.left, box.top, box.width, box.height);
}
