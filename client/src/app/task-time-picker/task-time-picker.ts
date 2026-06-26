import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { injectOverlayDismissBinding } from '../overlay-dismiss.service';

interface ParsedTime {
  hour12: number;
  minute: number;
  period: 'AM' | 'PM';
}

@Component({
  selector: 'app-task-time-picker',
  templateUrl: './task-time-picker.html',
  styleUrl: './task-time-picker.css',
})
export class TaskTimePicker {
  value = input<string>('09:00');

  select = output<string>();

  private host = inject(ElementRef<HTMLElement>);

  protected open = signal(false);
  protected hour12 = signal(9);
  protected minute = signal(0);
  protected period = signal<'AM' | 'PM'>('AM');

  protected readonly hours = Array.from({ length: 12 }, (_, index) => index + 1);
  protected readonly minutes = Array.from({ length: 60 }, (_, index) => index);
  protected readonly periods: Array<'AM' | 'PM'> = ['AM', 'PM'];

  protected hourCol = viewChild<ElementRef<HTMLElement>>('hourCol');
  protected minuteCol = viewChild<ElementRef<HTMLElement>>('minuteCol');
  protected periodCol = viewChild<ElementRef<HTMLElement>>('periodCol');

  protected displayValue = computed(() =>
    `${padNumber(this.hour12())}:${padNumber(this.minute())} ${this.period()}`
  );

  constructor() {
    injectOverlayDismissBinding(() => {
      if (!this.open()) return null;
      return {
        contains: target => this.host.nativeElement.contains(target),
        close: () => this.open.set(false),
      };
    });

    effect(() => {
      const parsed = parseTimeValue(this.value());
      this.hour12.set(parsed.hour12);
      this.minute.set(parsed.minute);
      this.period.set(parsed.period);
    });

    effect(() => {
      if (!this.open()) return;
      queueMicrotask(() => this.scrollSelectionIntoView());
    });
  }

  protected toggle(event: Event): void {
    event.stopPropagation();
    this.open.update(current => !current);
  }

  protected pickHour(hour: number): void {
    this.hour12.set(hour);
    this.emitValue();
    queueMicrotask(() => this.scrollColumnIntoView('hour'));
  }

  protected pickMinute(minute: number): void {
    this.minute.set(minute);
    this.emitValue();
    queueMicrotask(() => this.scrollColumnIntoView('minute'));
  }

  protected pickPeriod(next: 'AM' | 'PM'): void {
    this.period.set(next);
    this.emitValue();
    queueMicrotask(() => this.scrollColumnIntoView('period'));
  }

  protected pad(value: number): string {
    return padNumber(value);
  }

  private emitValue(): void {
    this.select.emit(to24Hour(this.hour12(), this.minute(), this.period()));
  }

  private scrollSelectionIntoView(): void {
    this.scrollColumnIntoView('hour');
    this.scrollColumnIntoView('minute');
    this.scrollColumnIntoView('period');
  }

  private scrollColumnIntoView(column: 'hour' | 'minute' | 'period'): void {
    const ref = column === 'hour'
      ? this.hourCol()
      : column === 'minute'
        ? this.minuteCol()
        : this.periodCol();
    const selected = ref?.nativeElement.querySelector('.time-option--selected') as HTMLElement | null;
    selected?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
}

function padNumber(value: number): string {
  return String(value).padStart(2, '0');
}

function parseTimeValue(value: string): ParsedTime {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return { hour12: 9, minute: 0, period: 'AM' };
  }

  const hour24 = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return { hour12, minute, period };
}

function to24Hour(hour12: number, minute: number, period: 'AM' | 'PM'): string {
  let hour24 = hour12 % 12;
  if (period === 'PM') hour24 += 12;
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
