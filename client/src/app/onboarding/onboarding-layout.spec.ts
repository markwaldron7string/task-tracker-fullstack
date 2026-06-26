import { buildThemePickerSpotlight, resolveTourTarget, spotlightPadding, unionDomRects } from './onboarding-layout';

describe('onboarding-layout', () => {
  it('uses tight padding for compact controls', () => {
    expect(spotlightPadding('upgrade', { height: 32, width: 88 } as DOMRect)).toBe(2);
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
});
