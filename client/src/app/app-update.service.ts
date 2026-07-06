import { DestroyRef, Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { TaskStore } from './task-store';

const STARTUP_CHECK_DELAYS_MS = [0, 2_000, 10_000];
const UPDATE_CHECK_INTERVAL_MS = 5 * 60_000;

export interface AppRefreshOptions {
  /** Wipe persisted app data (manual refresh). Update refresh keeps user data. */
  clearUserData?: boolean;
}

interface NgswManifest {
  assetGroups?: Array<{ urls?: string[] }>;
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
      const startupCheckIds = STARTUP_CHECK_DELAYS_MS.map(delay =>
        window.setTimeout(() => {
          this.ngZone.run(() => void this.checkNow());
        }, delay)
      );

      const intervalId = window.setInterval(() => {
        this.ngZone.run(() => void this.checkNow());
      }, UPDATE_CHECK_INTERVAL_MS);

      const checkOnResume = () => this.ngZone.run(() => void this.checkNow());
      const checkOnVisibility = () => {
        if (document.visibilityState === 'visible') {
          checkOnResume();
        }
      };

      window.addEventListener('focus', checkOnResume, { passive: true });
      document.addEventListener('visibilitychange', checkOnVisibility);
      window.addEventListener('pageshow', checkOnResume, { passive: true });

      this.destroyRef.onDestroy(() => {
        for (const id of startupCheckIds) {
          window.clearTimeout(id);
        }
        window.clearInterval(intervalId);
        window.removeEventListener('focus', checkOnResume);
        document.removeEventListener('visibilitychange', checkOnVisibility);
        window.removeEventListener('pageshow', checkOnResume);
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
    const loadedHash = this.readCurrentBundleHash();
    if (!loadedHash || this.updateReady()) return;

    try {
      const latestHash = await this.fetchLatestMainBundleHash();
      if (latestHash && latestHash !== loadedHash) {
        this.updateReady.set(true);
      }
    } catch {
      // Ignore network errors during background checks.
    }
  }

  private async fetchLatestMainBundleHash(): Promise<string | null> {
    const fromManifest = await this.fetchMainHashFromManifest();
    if (fromManifest) return fromManifest;
    return this.fetchMainHashFromIndex();
  }

  private async fetchMainHashFromManifest(): Promise<string | null> {
    const response = await this.fetchBypass('/ngsw.json');
    if (!response) return null;

    const manifest = await response.json() as NgswManifest;
    for (const group of manifest.assetGroups ?? []) {
      for (const asset of group.urls ?? []) {
        const hash = this.extractMainBundleHash(asset);
        if (hash) return hash;
      }
    }

    return null;
  }

  private async fetchMainHashFromIndex(): Promise<string | null> {
    const response = await this.fetchBypass('/');
    if (!response) return null;

    const html = await response.text();
    return this.extractMainBundleHash(html);
  }

  private async fetchBypass(path: string): Promise<Response | null> {
    try {
      const response = await fetch(this.buildBypassUrl(path), {
        cache: 'no-store',
        headers: { 'ngsw-bypass': 'true' },
      });
      return response.ok ? response : null;
    } catch {
      return null;
    }
  }

  private shouldCheckForUpdates(): boolean {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host !== 'localhost' && host !== '127.0.0.1';
  }

  private buildBypassUrl(path: string): string {
    const url = new URL(path, window.location.origin);
    url.searchParams.set('update-check', String(Date.now()));
    // Bypass the Angular service worker so we read the live deploy hash.
    url.searchParams.set('ngsw-bypass', 'true');
    return url.toString();
  }

  private readCurrentBundleHash(): string | null {
    const script = document.querySelector('script[src*="main-"]') as HTMLScriptElement | null;
    if (script?.src) {
      const hash = this.extractMainBundleHash(script.src);
      if (hash) return hash;
    }

    if (typeof performance !== 'undefined') {
      const entry = performance.getEntriesByType('resource')
        .find(item => /main-[A-Za-z0-9]+\.js/i.test(item.name));
      if (entry) {
        const hash = this.extractMainBundleHash(entry.name);
        if (hash) return hash;
      }
    }

    return null;
  }

  private extractMainBundleHash(source: string): string | null {
    const match = source.match(/main-([A-Za-z0-9]+)\.js/i);
    return match?.[1] ?? null;
  }
}
