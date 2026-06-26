export type NotificationSupportStatus =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'ios-needs-install'
  | 'unsupported';

export interface NotificationSupport {
  status: NotificationSupportStatus;
  message: string | null;
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function hasNotificationApi(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationSupport(): NotificationSupport {
  if (typeof window === 'undefined') {
    return { status: 'unsupported', message: 'Notifications are not available in this browser.' };
  }

  if (isIosDevice() && !isStandaloneDisplay()) {
    return {
      status: 'ios-needs-install',
      message:
        'On smartphone and tablet, add Task Tracker to your Home Screen first, then open the app from that icon to enable reminders.',
    };
  }

  if (!hasNotificationApi()) {
    return {
      status: 'unsupported',
      message: 'Notifications are not available in this browser. Try Chrome, Safari, or install the app.',
    };
  }

  const permission = Notification.permission;
  if (permission === 'granted') {
    return { status: 'granted', message: null };
  }
  if (permission === 'denied') {
    return {
      status: 'denied',
      message: 'Notifications are blocked. Enable them in your browser settings, then try again.',
    };
  }

  return { status: 'prompt', message: null };
}
