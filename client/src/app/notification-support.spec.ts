import { getNotificationSupport, hasNotificationApi, isIosDevice, isStandaloneDisplay } from './notification-support';

function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query === '(display-mode: standalone)' ? matches : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe('notification-support', () => {
  it('detects iOS browser tabs as needing install before notifications work', () => {
    stubMatchMedia(false);
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });

    expect(getNotificationSupport().status).toBe('ios-needs-install');
  });

  it('treats installed iOS PWAs as promptable when Notification exists', () => {
    stubMatchMedia(true);
    vi.stubGlobal('Notification', class NotificationMock {
      static permission = 'default';
    });

    expect(isIosDevice()).toBe(true);
    expect(isStandaloneDisplay()).toBe(true);
    expect(hasNotificationApi()).toBe(true);
    expect(getNotificationSupport().status).toBe('prompt');
  });
});
