import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { THEMES, ThemeCategory, ThemeService } from '../theme.service';

@Component({
  selector: 'theme-picker',
  templateUrl: './theme-picker.html',
  styleUrl: './theme-picker.css',
})
export class ThemePicker {
  protected theme = inject(ThemeService);
  private host = inject(ElementRef<HTMLElement>);

  protected open = signal(false);
  protected category = signal<ThemeCategory>(this.categoryOf(this.theme.active()));

  protected activeTheme = computed(() =>
    THEMES.find(t => t.id === this.theme.active())
  );

  protected filteredThemes = computed(() =>
    THEMES.filter(t => t.category === this.category())
  );

  protected toggle(): void {
    const next = !this.open();
    // Open the panel on the tab that matches the current theme.
    if (next) this.category.set(this.categoryOf(this.theme.active()));
    this.open.set(next);
  }

  protected switchCategory(cat: ThemeCategory): void {
    this.category.set(cat);
    // Carry the current color family across to the new category
    const color = this.theme.active().split('-')[1]; // "red", "ocean", etc.
    const targetId = `${cat}-${color}`;
    if (THEMES.some(t => t.id === targetId)) {
      this.theme.set(targetId);
    }
  }

  protected select(id: string): void {
    this.theme.set(id);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }

  private categoryOf(id: string): ThemeCategory {
    return THEMES.find(t => t.id === id)?.category ?? 'light';
  }
}
