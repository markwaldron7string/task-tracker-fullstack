import { Component, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { injectOverlayDismissBinding } from '../overlay-dismiss.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { ProUpgrade } from '../pro-upgrade/pro-upgrade';
import { ProService } from '../pro.service';
import { CUSTOM_ID, THEMES, ThemeCategory, ThemeService } from '../theme.service';

type Tab = ThemeCategory | 'custom';

const DEFAULT_ACCENTS = ['#FF5C8A', '#FF8A1E', '#FFD23F', '#3DDC97', '#22D3EE', '#7C5CFF'];
const DEFAULT_ACCENT = DEFAULT_ACCENTS[DEFAULT_ACCENTS.length - 1];

@Component({
  selector: 'theme-picker',
  imports: [ProUpgrade],
  templateUrl: './theme-picker.html',
  styleUrl: './theme-picker.css',
})
export class ThemePicker {
  protected theme = inject(ThemeService);
  protected pro = inject(ProService);
  private onboarding = inject(OnboardingService);
  private host = inject(ElementRef<HTMLElement>);

  protected open = signal(false);
  protected tab = signal<Tab>(this.initialTab());
  protected useAnchoredPanel = signal(false);
  protected panelTop = signal<string | null>(null);
  protected panelLeft = signal<string | null>(null);

  protected customBase = signal<ThemeCategory>(this.theme.custom()?.base ?? 'dark');
  protected customAccent = signal<string>(this.theme.custom()?.accent ?? DEFAULT_ACCENT);
  protected accents = signal<string[]>(this.initAccents());

  protected filteredThemes = computed(() =>
    THEMES.filter(t => t.category === this.tab())
  );

  protected isCustom = computed(() => this.theme.active() === CUSTOM_ID);

  protected triggerSwatch = computed(() =>
    this.isCustom()
      ? this.theme.custom()?.accent ?? this.customAccent()
      : THEMES.find(t => t.id === this.theme.active())?.swatch
  );

  protected triggerLabel = computed(() =>
    this.isCustom()
      ? 'Custom'
      : THEMES.find(t => t.id === this.theme.active())?.name
  );

  protected customTabDisabled = computed(() => this.onboarding.introThemeStepActive());

  constructor() {
    injectOverlayDismissBinding(() => {
      if (!this.open()) return null;
      return {
        contains: target => this.host.nativeElement.contains(target),
        close: () => this.closePanel(),
      };
    });

    effect(() => {
      this.onboarding.openThemePickerTick();
      if (!this.onboarding.introThemeStepActive()) return;
      this.openPanel();
      if (this.tab() === 'custom') {
        this.tab.set(this.initialTab() === 'custom' ? 'dark' : this.initialTab());
      }
    });
  }

  protected openPanel(): void {
    if (this.open()) return;
    this.tab.set(this.initialTab() === 'custom' && this.customTabDisabled() ? 'dark' : this.initialTab());
    this.open.set(true);
    queueMicrotask(() => this.alignPanel());
  }

  protected toggle(event: Event): void {
    event.stopPropagation();
    if (this.open()) {
      this.closePanel();
      return;
    }
    this.openPanel();
  }

  protected closePanel(): void {
    this.open.set(false);
    this.resetPanelPosition();
  }

  protected onPanelClick(event: Event): void {
    event.stopPropagation();
  }

  private resetPanelPosition(): void {
    this.useAnchoredPanel.set(false);
    this.panelTop.set(null);
    this.panelLeft.set(null);
  }

  protected switchTab(tab: Tab): void {
    if (tab === 'custom' && this.customTabDisabled()) return;
    this.tab.set(tab);
    if (tab === 'custom') {
      if (this.pro.unlocked()) this.applyCustom();
      return;
    }
    const current = this.theme.active();
    const color = current !== CUSTOM_ID && current.includes('-') ? current.split('-')[1] : 'ocean';
    const targetId = `${tab}-${color}`;
    this.theme.set(THEMES.some(t => t.id === targetId) ? targetId : `${tab}-red`);
  }

  protected select(id: string): void {
    this.theme.set(id);
  }

  protected setBase(base: ThemeCategory): void {
    this.customBase.set(base);
    this.applyCustom();
  }

  protected setAccent(accent: string): void {
    this.customAccent.set(accent);
    this.applyCustom();
  }

  protected pickAccent(index: number, color: string): void {
    this.accents.update(list => {
      const next = [...list];
      next[index] = color;
      return next;
    });
    this.setAccent(color);
  }

  protected onProUnlocked(): void {
    this.applyCustom();
  }

  protected unlockPro(): void {
    this.pro.unlock();
    this.applyCustom();
  }

  private applyCustom(): void {
    if (!this.pro.unlocked()) return;
    this.theme.setCustom(this.customBase(), this.customAccent());
  }

  private initAccents(): string[] {
    const palette = [...DEFAULT_ACCENTS];
    const current = this.theme.custom()?.accent;
    if (current && !palette.some(c => c.toLowerCase() === current.toLowerCase())) {
      palette[0] = current;
    }
    return palette;
  }

  private initialTab(): Tab {
    if (this.theme.active() === CUSTOM_ID) return 'custom';
    return THEMES.find(t => t.id === this.theme.active())?.category ?? 'light';
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closePanel();
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected onViewportChange(): void {
    if (this.open()) this.alignPanel();
  }

  private alignPanel(): void {
    const panel = this.host.nativeElement.querySelector('.panel') as HTMLElement | null;
    const trigger = this.host.nativeElement.querySelector('.trigger') as HTMLElement | null;
    if (!panel || !trigger) return;

    if (window.innerWidth > 1024) {
      this.resetPanelPosition();
      return;
    }

    const margin = 12;
    const triggerRect = trigger.getBoundingClientRect();
    const panelWidth = panel.offsetWidth;
    const viewportWidth = window.innerWidth;

    let left = triggerRect.right - panelWidth;
    left = Math.max(margin, Math.min(left, viewportWidth - panelWidth - margin));

    this.useAnchoredPanel.set(true);
    this.panelTop.set(`${triggerRect.bottom + 8}px`);
    this.panelLeft.set(`${left}px`);
  }
}
