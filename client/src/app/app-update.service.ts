import { DestroyRef, Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { TaskStore } from './task-store';

const FIRST_CHECK_DELAY_MS = 15_000;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60_000;

export interface AppRefreshOptions {
  /** Wipe persisted app data (manual refresh). Update refresh keeps user data. */
  clearUserData?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private swUpdate = inject(SwUpdate);
  private ngZone = inject(NgZone);
  private destroyRef = inject(DestroyRef);
  private taskStore = inject(TaskStore);

  readonly enabled = this.swUpdate.isEnabled;
  readonly updateReady = signal(false);
  readonly activating = signal(false);
  readonly unrecoverable = signal(false);
  readonly checking = signal(false);

  private readonly loadedBundleHash = this.readCurrentBundleHash();

  readonly title = computed(() =>
    this.unrecoverable() ? 'App refresh needed' : 'New update available'
  );

  readonly body = computed(() =>
    this.unrecoverable()
      ? 'Refresh this app to recover from an old cached version.'
      : 'A newer version of Task Tracker was deployed. Refresh to get the latest changes.'
  );

  constructor() {
    if (typeof window === 'undefined') return;

    if (this.swUpdate.isEnabled) {
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
    }

    this.scheduleUpdateChecks();
  }

  async checkNow(): Promise<void> {
    if (this.checking() || this.updateReady()) return;

    this.checking.set(true);
    try {
      await Promise.all([
        this.checkServiceWorkerUpdate(),
        this.checkDeployHash(),
      ]);
    } finally {
      this.checking.set(false);
    }
  }

  async refresh(options: AppRefreshOptions = {}): Promise<void> {
    if (this.activating()) return;

    const clearUserData = options.clearUserData ?? this.unrecoverable();

    this.activating.set(true);
    try {
      if (!clearUserData) {
        await this.taskStore.prepareForAppRefresh();
      }
      if (this.swUpdate.isEnabled && !this.unrecoverable()) {
        await this.swUpdate.activateUpdate().catch(() => false);
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if (clearUserData) {
        try { localStorage.clear(); } catch { /* storage may be unavailable */ }
        try { sessionStorage.clear(); } catch { /* storage may be unavailable */ }
      }
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
    if (!this.shouldCheckForUpdates()) return;

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

  private async checkServiceWorkerUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled || this.updateReady()) return;

    try {
      const ready = await this.swUpdate.checkForUpdate();
      if (ready) this.updateReady.set(true);
    } catch (error) {
      console.warn('App update check failed.', error);
    }
  }

  private async checkDeployHash(): Promise<void> {
    if (!this.loadedBundleHash || this.updateReady()) return;

    try {
      const response = await fetch(this.buildCheckUrl(), {
        cache: 'no-store',
        headers: { 'ngsw-bypass': 'true' },
      });
      if (!response.ok) return;

      const html = await response.text();
      const latestHash = this.extractMainBundleHash(html);

      if (latestHash && latestHash !== this.loadedBundleHash) {
        this.updateReady.set(true);
      }
    } catch {
      // Ignore network errors during background checks.
    }
  }

  private shouldCheckForUpdates(): boolean {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host !== 'localhost' && host !== '127.0.0.1';
  }

  private buildCheckUrl(): string {
    const baseHref = document.querySelector('base')?.getAttribute('href') ?? '/';
    const url = new URL(baseHref, window.location.origin);
    url.searchParams.set('update-check', String(Date.now()));
    // Bypass the Angular service worker so we read the live deploy hash.
    url.searchParams.set('ngsw-bypass', 'true');
    return url.toString();
  }

  private readCurrentBundleHash(): string | null {
    const script = document.querySelector('script[src*="main-"]') as HTMLScriptElement | null;
    if (!script?.src) return null;
    return this.extractMainBundleHash(script.src);
  }

  private extractMainBundleHash(source: string): string | null {
    const match = source.match(/main-([A-Za-z0-9]+)\.js/);
    return match?.[1] ?? null;
  }
}
