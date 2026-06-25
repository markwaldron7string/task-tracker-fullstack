import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProFeatureId, PRO_AI_NOTE, PRO_FEATURES, PRO_PRICE_LABEL, PRO_TAGLINE, proFeature } from '../pro-features';
import { ProService } from '../pro.service';

@Component({
  selector: 'app-pro-upgrade',
  imports: [RouterLink],
  templateUrl: './pro-upgrade.html',
  styleUrl: './pro-upgrade.css',
})
export class ProUpgrade {
  protected pro = inject(ProService);

  /** Which feature triggered this gate — customizes the headline. */
  feature = input<ProFeatureId | null>(null);
  /** `inline` for embedded gates; `page` for the full upgrade screen. */
  variant = input<'inline' | 'page'>('inline');
  /** Hide the link to the full upgrade page (e.g. when already on it). */
  showLearnMore = input(true);

  unlocked = output<void>();

  protected readonly price = PRO_PRICE_LABEL;
  protected readonly tagline = PRO_TAGLINE;
  protected readonly aiNote = PRO_AI_NOTE;
  protected readonly allFeatures = PRO_FEATURES;

  protected headline(): string {
    const id = this.feature();
    return id ? `${proFeature(id).title} is Pro` : 'Upgrade to Pro';
  }

  protected copy(): string {
    const id = this.feature();
    if (id) return proFeature(id).description;
    return 'Unlock planning tools, custom themes, and an AI coach that helps you stay on top of your day.';
  }

  protected unlock(): void {
    this.pro.unlock();
    this.unlocked.emit();
  }
}
