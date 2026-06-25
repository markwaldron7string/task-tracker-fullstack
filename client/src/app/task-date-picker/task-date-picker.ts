import { Component, computed, input, output, signal } from '@angular/core';
import { buildMiniCalendar, parseIsoDateInput } from '../mini-calendar';
import { offsetDateIso } from '../task-store';

@Component({
  selector: 'app-task-date-picker',
  templateUrl: './task-date-picker.html',
  styleUrl: './task-date-picker.css',
})
export class TaskDatePicker {
  value = input<string | null>(null);
  /** `popover` = bottom sheet on screen; `compact` = inline in edit dialog (no grid). */
  mode = input<'popover' | 'compact'>('popover');

  select = output<string | null>();
  dismiss = output<void>();

  protected viewYear = signal(new Date().getFullYear());
  protected viewMonth = signal(new Date().getMonth());

  protected monthLabel = computed(() =>
    new Date(this.viewYear(), this.viewMonth(), 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
  );

  protected cells = computed(() =>
    buildMiniCalendar(this.viewYear(), this.viewMonth(), this.value())
  );

  protected onPanelClick(event: Event): void {
    event.stopPropagation();
  }

  protected pickDay(iso: string): void {
    this.select.emit(iso);
  }

  protected pickQuick(iso: string): void {
    this.select.emit(iso);
  }

  protected clearDate(): void {
    this.select.emit(null);
  }

  protected onDateInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const parsed = parseIsoDateInput(value);
    if (parsed) this.select.emit(parsed);
    if (!value) this.select.emit(null);
  }

  protected prevMonth(): void {
    const m = this.viewMonth();
    const y = this.viewYear();
    if (m === 0) {
      this.viewMonth.set(11);
      this.viewYear.set(y - 1);
    } else {
      this.viewMonth.set(m - 1);
    }
  }

  protected nextMonth(): void {
    const m = this.viewMonth();
    const y = this.viewYear();
    if (m === 11) {
      this.viewMonth.set(0);
      this.viewYear.set(y + 1);
    } else {
      this.viewMonth.set(m + 1);
    }
  }

  protected todayIso(): string {
    return offsetDateIso(0);
  }

  protected tomorrowIso(): string {
    return offsetDateIso(1);
  }
}
