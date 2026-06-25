import { resolveTourTarget, spotlightPadding } from './onboarding-layout';

describe('onboarding-layout', () => {
  it('uses tight padding for compact controls', () => {
    expect(spotlightPadding('upgrade', { height: 32, width: 88 } as DOMRect)).toBe(2);
  });

  it('uses roomy padding for large tour sections', () => {
    expect(spotlightPadding('calendar-view', { height: 420, width: 360 } as DOMRect)).toBe(6);
  });

  it('resolves theme picker to the trigger button', () => {
    const root = document.createElement('theme-picker');
    const trigger = document.createElement('button');
    trigger.className = 'trigger';
    root.appendChild(trigger);

    expect(resolveTourTarget(root, 'theme-picker')).toBe(trigger);
  });
});
