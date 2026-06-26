import { DestroyRef, Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

const FIRST_CHECK_DELAY_MS = 45_000;
const UPDATE_CHECK_INTERVAL_MS = 15 * 60_000;

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private swUpdate = inject(SwUpdate);
  private ngZone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  readonly enabled = this.swUpdate.isEnabled;
  readonly updateReady = signal(false);
  readonly activating = signal(false);
  readonly unrecoverable = signal(false);
  readonly checking = signal(false);

  readonly title = computed(() =>
    this.unrecoverable() ? 'App refresh needed' : 'New version available'
  );

  readonly body = computed(() =>
    this.unrecoverable()
      ? 'Refresh this app to recover from an old cached version.'
      : 'Refresh this app to use the latest fixes.'
  );

  constructor() {
    if (!this.swUpdate.isEnabled || typeof window === 'undefined') return;

    const versionSub = this.swUpdate.versionUpdates.subscribe(event => {
      if (event.type === 'VERSION_READY') {
        this.updateReady.set(true);
      }
      if (event.type === 'VERSION_INSTALLATION_FAILED') {
        console.warn('App update failed to install.', event.error);
      }
    });

    const unrecoverableSub = this.swUpdate.unrecoverable.subscribe(event => {
      console.warn('App is in an unrecoverable service worker state.', event.reason);
      this.unrecoverable.set(true);
      this.updateReady.set(true);
    });

    this.destroyRef.onDestroy(() => {
      versionSub.unsubscribe();
      unrecoverableSub.unsubscribe();
    });

    this.scheduleUpdateChecks();
  }

  async checkNow(): Promise<void> {
    if (!this.swUpdate.isEnabled || this.checking() || this.updateReady()) return;

    this.checking.set(true);
    try {
      const ready = await this.swUpdate.checkForUpdate();
      if (ready) this.updateReady.set(true);
    } catch (error) {
      console.warn('App update check failed.', error);
    } finally {
      this.checking.set(false);
    }
  }

  async refresh(): Promise<void> {
    if (this.activating()) return;

    this.activating.set(true);
    try {
      if (!this.unrecoverable()) {
        await this.swUpdate.activateUpdate().catch(() => false);
      }
      // Clear all Cache Storage so the browser fetches a fresh build.
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // Wipe all persisted state so the app restarts from defaults —
      // tutorials will run again, theme resets, tasks cleared locally.
      try { localStorage.clear(); } catch { /* storage may be unavailable */ }
      try { sessionStorage.clear(); } catch { /* storage may be unavailable */ }
    } finally {
      window.location.reload();
    }
  }

  dismiss(): void {
    if (!this.unrecoverable()) {
      this.updateReady.set(false);
    }
  }

  private scheduleUpdateChecks(): void {
    this.ngZone.runOutsideAngular(() => {
      const firstCheckId = window.setTimeout(() => {
        this.ngZone.run(() => void this.checkNow());
      }, FIRST_CHECK_DELAY_MS);

      const intervalId = window.setInterval(() => {
        this.ngZone.run(() => void this.checkNow());
      }, UPDATE_CHECK_INTERVAL_MS);

      const checkOnFocus = () => this.ngZone.run(() => void this.checkNow());
      const checkOnVisibility = () => {
        if (document.visibilityState === 'visible') {
          this.ngZone.run(() => void this.checkNow());
        }
      };

      window.addEventListener('focus', checkOnFocus, { passive: true });
      document.addEventListener('visibilitychange', checkOnVisibility);

      this.destroyRef.onDestroy(() => {
        window.clearTimeout(firstCheckId);
        window.clearInterval(intervalId);
        window.removeEventListener('focus', checkOnFocus);
        document.removeEventListener('visibilitychange', checkOnVisibility);
      });
    });
  }
}
