import { Injectable, signal, effect } from '@angular/core';

export type ThemeCategory = 'light' | 'dark' | 'neon';

export interface Theme {
  id: string;
  name: string;
  swatch: string;
  category: ThemeCategory;
}

export interface CustomTheme {
  base: ThemeCategory;
  accent: string;
}

export const CUSTOM_ID = 'custom';

export const THEMES: Theme[] = [
  // Light
  { id: 'light-red',    name: 'Ruby',    swatch: '#DD0031', category: 'light' },
  { id: 'light-ocean',  name: 'Ocean',   swatch: '#0288D1', category: 'light' },
  { id: 'light-forest', name: 'Forest',  swatch: '#43A047', category: 'light' },
  { id: 'light-sunset', name: 'Sunset',  swatch: '#F4511E', category: 'light' },
  { id: 'light-sakura', name: 'Sakura',  swatch: '#E91E63', category: 'light' },
  { id: 'light-galaxy', name: 'Galaxy',  swatch: '#8E24AA', category: 'light' },
  // Dark
  { id: 'dark-red',    name: 'Crimson', swatch: '#FF4D6D', category: 'dark' },
  { id: 'dark-ocean',  name: 'Abyss',   swatch: '#42A5F5', category: 'dark' },
  { id: 'dark-forest', name: 'Canopy',  swatch: '#66BB6A', category: 'dark' },
  { id: 'dark-sunset', name: 'Ember',   swatch: '#FF7043', category: 'dark' },
  { id: 'dark-sakura', name: 'Dusk',    swatch: '#F06292', category: 'dark' },
  { id: 'dark-galaxy', name: 'Nebula',  swatch: '#BA68C8', category: 'dark' },
  // Neon — same 6 color families as light/dark, but with vivid electrified accents
  { id: 'neon-red',    name: 'Inferno', swatch: '#FF1744', category: 'neon' },
  { id: 'neon-ocean',  name: 'Cyber',   swatch: '#00FFF5', category: 'neon' },
  { id: 'neon-forest', name: 'Matrix',  swatch: '#00E676', category: 'neon' },
  { id: 'neon-sunset', name: 'Blade',   swatch: '#FF6D00', category: 'neon' },
  { id: 'neon-sakura', name: 'Vapor',   swatch: '#FF2D78', category: 'neon' },
  { id: 'neon-galaxy', name: 'Violina', swatch: '#D500F9', category: 'neon' },
];

const MIGRATIONS: Record<string, string> = {
  // v1 single-category IDs
  red: 'light-red', ocean: 'light-ocean', forest: 'light-forest',
  sunset: 'light-sunset', sakura: 'light-sakura', galaxy: 'light-galaxy',
  midnight: 'dark-ocean', terminal: 'dark-forest',
  // v2 neon IDs before color-family rename
  'neon-cyan': 'neon-ocean', 'neon-pink': 'neon-sakura',
  'neon-orange': 'neon-sunset', 'neon-green': 'neon-forest',
  'neon-purple': 'neon-galaxy', 'neon-yellow': 'neon-red',
};

const CUSTOM_VARS = ['--red', '--red-dark', '--red-light', '--red-border', '--red-glow', '--on-primary'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themes = THEMES;
  readonly active = signal(this.loadActive());
  readonly custom = signal<CustomTheme | null>(this.loadCustom());

  constructor() {
    effect(() => {
      const id = this.active();
      const custom = this.custom();
      const root = document.documentElement;

      this.clearCustomVars(root);
      if (id === CUSTOM_ID && custom) {
        this.applyCustom(root, custom);
      } else {
        root.setAttribute('data-theme', id === CUSTOM_ID ? 'light-red' : id);
      }

      localStorage.setItem('theme', id);
      if (custom) localStorage.setItem('theme-custom', JSON.stringify(custom));
      requestAnimationFrame(() => this.syncOnPrimary(root));
    });
  }

  private syncOnPrimary(root: HTMLElement): void {
    const accent = getComputedStyle(root).getPropertyValue('--red').trim();
    const rgb = parseCssColor(accent);
    if (!rgb) return;
    const { r, g, b } = rgb;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    root.style.setProperty('--on-primary', luminance > 0.6 ? '#0A0A0A' : '#ffffff');
  }

  set(id: string): void {
    this.active.set(id);
  }

  setCustom(base: ThemeCategory, accent: string): void {
    this.custom.set({ base, accent });
    this.active.set(CUSTOM_ID);
  }

  private clearCustomVars(root: HTMLElement): void {
    for (const name of CUSTOM_VARS) root.style.removeProperty(name);
  }

  private applyCustom(root: HTMLElement, custom: CustomTheme): void {
    root.setAttribute('data-theme', `${custom.base}-custom`);

    const { r, g, b } = hexToRgb(custom.accent);
    const accent = custom.accent;
    root.style.setProperty('--red', accent);

    if (custom.base === 'neon') {
      // Neon derives --red-light / --red-border from --red-glow (see styles.css).
      root.style.setProperty('--red-dark', `color-mix(in srgb, ${accent} 65%, #ffffff)`);
      root.style.setProperty('--red-glow', `${r}, ${g}, ${b}`);
    } else if (custom.base === 'dark') {
      root.style.setProperty('--red-dark', `color-mix(in srgb, ${accent} 82%, #000000)`);
      root.style.setProperty('--red-light', `color-mix(in srgb, ${accent} 14%, #0C0E13)`);
      root.style.setProperty('--red-border', `color-mix(in srgb, ${accent} 40%, #0C0E13)`);
    } else {
      root.style.setProperty('--red-dark', `color-mix(in srgb, ${accent} 85%, #000000)`);
      root.style.setProperty('--red-light', `color-mix(in srgb, ${accent} 12%, #ffffff)`);
      root.style.setProperty('--red-border', `color-mix(in srgb, ${accent} 32%, #ffffff)`);
    }

    // Pick legible text for solid accent surfaces (buttons) based on luminance.
    this.syncOnPrimary(root);
  }

  private loadActive(): string {
    const saved = localStorage.getItem('theme') ?? '';
    if (saved === CUSTOM_ID) return CUSTOM_ID;
    const migrated = MIGRATIONS[saved] ?? saved;
    return THEMES.some(t => t.id === migrated) ? migrated : 'light-red';
  }

  private loadCustom(): CustomTheme | null {
    try {
      const raw = localStorage.getItem('theme-custom');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<CustomTheme>;
      const base = parsed.base;
      if ((base === 'light' || base === 'dark' || base === 'neon') && typeof parsed.accent === 'string') {
        return { base, accent: parsed.accent };
      }
    } catch {
      // Ignore malformed custom theme and fall back to presets.
    }
    return null;
  }
}

function parseCssColor(color: string): { r: number; g: number; b: number } | null {
  const trimmed = color.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#')) return hexToRgb(trimmed);
  const match = trimmed.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (match) {
    return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
  }
  return hexToRgb(trimmed);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let value = hex.replace('#', '').trim();
  if (value.length === 3) {
    value = value.split('').map(c => c + c).join('');
  }
  const int = parseInt(value, 16);
  if (value.length !== 6 || Number.isNaN(int)) {
    return { r: 124, g: 92, b: 255 };
  }
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}
