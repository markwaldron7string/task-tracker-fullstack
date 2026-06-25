import { Injectable, signal } from '@angular/core';
import { ProFeatureId } from './pro-features';

const PRO_STORAGE_KEY = 'ttf-pro-unlocked';

@Injectable({ providedIn: 'root' })
export class ProService {
  readonly unlocked = signal(this.load());

  /** Demo unlock — real IAP would replace this later. */
  unlock(): void {
    this.unlocked.set(true);
    localStorage.setItem(PRO_STORAGE_KEY, '1');
  }

  hasFeature(_feature: ProFeatureId): boolean {
    return this.unlocked();
  }

  private load(): boolean {
    return localStorage.getItem(PRO_STORAGE_KEY) === '1';
  }
}
