import { getNotificationSupport, hasNotificationApi, isIosDevice, isStandaloneDisplay } from './notification-support';

describe('notification-support', () => {
  it('detects iOS browser tabs as needing install before notifications work', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: false });

    expect(getNotificationSupport().status).toBe('ios-needs-install');
  });

  it('treats installed iOS PWAs as promptable when Notification exists', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    Object.defineProperty(Notification, 'permission', { configurable: true, value: 'default' });
    vi.stubGlobal('Notification', class NotificationMock {
      static permission = 'default';
    });

    expect(isIosDevice()).toBe(true);
    expect(isStandaloneDisplay()).toBe(true);
    expect(hasNotificationApi()).toBe(true);
    expect(getNotificationSupport().status).toBe('prompt');
  });
});
