import { Injectable, signal, effect } from '@angular/core';

export type ThemeCategory = 'light' | 'dark' | 'neon';

export interface Theme {
  id: string;
  name: string;
  swatch: string;
  category: ThemeCategory;
}

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

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly themes = THEMES;
  readonly active = signal(this.load());

  constructor() {
    effect(() => {
      const id = this.active();
      document.documentElement.setAttribute('data-theme', id);
      localStorage.setItem('theme', id);
    });
  }

  set(id: string): void {
    this.active.set(id);
  }

  private load(): string {
    const saved = localStorage.getItem('theme') ?? '';
    const migrated = MIGRATIONS[saved] ?? saved;
    return THEMES.some(t => t.id === migrated) ? migrated : 'light-red';
  }
}
