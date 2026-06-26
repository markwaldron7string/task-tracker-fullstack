import {
  buildSpotlightBox,
  buildThemePickerSpotlight,
  computeCardNearTarget,
  computeDownwardPointerAboveTarget,
  computeHeaderPinnedFlagPosition,
  resolveTourTarget,
  spotlightPadding,
  unionDomRects,
} from './onboarding-layout';

describe('onboarding-layout', () => {
  it('uses tight padding for compact controls', () => {
    expect(spotlightPadding('upgrade', { height: 32, width: 88 } as DOMRect)).toBe(1);
  });

  it('uses roomy padding for large tour sections', () => {
    expect(spotlightPadding('calendar-view', { height: 420, width: 360 } as DOMRect)).toBe(6);
  });

  it('resolves theme picker to the picker root', () => {
    const root = document.createElement('div');
    root.className = 'picker';
    const trigger = document.createElement('button');
    trigger.className = 'trigger';
    root.appendChild(trigger);

    expect(resolveTourTarget(root, 'theme-picker')).toBe(root);
  });

  it('builds a combined spotlight for the trigger and panel', () => {
    const root = document.createElement('div');
    root.className = 'picker';

    const trigger = document.createElement('button');
    trigger.className = 'trigger';
    trigger.getBoundingClientRect = () => new DOMRect(200, 20, 100, 36);
    root.appendChild(trigger);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.getBoundingClientRect = () => new DOMRect(120, 64, 264, 180);
    root.appendChild(panel);

    Object.defineProperty(panel, 'offsetParent', { value: document.body });
    window.getComputedStyle = () => ({ borderRadius: '12px' }) as CSSStyleDeclaration;

    const box = buildThemePickerSpotlight(root);
    expect(box?.width).toBe(unionDomRects(
      trigger.getBoundingClientRect(),
      panel.getBoundingClientRect()
    ).width + 10);
  });

  it('pins the tour card below the header with the arrow aimed at the target', () => {
    const flag = computeHeaderPinnedFlagPosition(
      new DOMRect(280, 18, 72, 28),
      116,
      320,
      12,
      0
    );
    expect(flag.top).toBe(116);
    expect(flag.placement).toBe('bottom');
  });

  it('positions the tour card above the target controls', () => {
    const targetRect = new DOMRect(520, 600, 260, 40);
    const flagHeight = 220;
    const flag = computeCardNearTarget(targetRect, 320, flagHeight, 12, 18, 'above');

    expect(targetRect.top - (flag.top + flagHeight)).toBeGreaterThanOrEqual(18);
    expect(flag.placement).toBe('top');
  });

  it('positions a downward pointer just above compact controls', () => {
    const targetRect = new DOMRect(520, 420, 180, 36);
    const pointer = computeDownwardPointerAboveTarget(targetRect);

    expect(pointer.x).toBe(610);
    expect(pointer.y).toBe(392);
    expect(pointer.rotation).toBe(180);
  });

  it('builds a nav spotlight from the actual nav links', () => {
    const nav = document.createElement('nav');
    const first = document.createElement('a');
    const second = document.createElement('a');
    first.getBoundingClientRect = () => new DOMRect(12, 90, 80, 36);
    second.getBoundingClientRect = () => new DOMRect(100, 90, 90, 36);
    nav.getBoundingClientRect = () => new DOMRect(0, 20, 220, 120);
    nav.append(first, second);

    window.getComputedStyle = () => ({ borderRadius: '8px' }) as CSSStyleDeclaration;

    const box = buildSpotlightBox(
      { id: 'nav', target: 'nav', title: '', body: '', placement: 'bottom' },
      nav
    );

    expect(box.top).toBe(86);
    expect(box.height).toBe(44);
  });
});
