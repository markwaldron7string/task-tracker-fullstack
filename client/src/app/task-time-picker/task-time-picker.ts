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

/** How many copies of the hour/minute list to render so the wheel can be
 *  scrolled continuously; the middle copy is where we settle after any
 *  scroll, giving a full copy's worth of slack in each direction. */
const LOOP_COPIES = 3;

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

  protected readonly hoursLoop = repeat(this.hours, LOOP_COPIES);
  protected readonly minutesLoop = repeat(this.minutes, LOOP_COPIES);

  protected hourCol = viewChild<ElementRef<HTMLElement>>('hourCol');
  protected minuteCol = viewChild<ElementRef<HTMLElement>>('minuteCol');
  protected periodCol = viewChild<ElementRef<HTMLElement>>('periodCol');

  protected displayValue = computed(() =>
    `${padNumber(this.hour12())}:${padNumber(this.minute())} ${this.period()}`
  );

  private wheelCleanups: Array<() => void> = [];

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
      if (!this.open()) {
        this.teardownInfiniteWheels();
        return;
      }
      queueMicrotask(() => {
        this.scrollSelectionIntoView();
        this.teardownInfiniteWheels();
        this.wheelCleanups.push(
          bindInfiniteWheel(this.hourCol()?.nativeElement, this.hours.length),
          bindInfiniteWheel(this.minuteCol()?.nativeElement, this.minutes.length),
        );
      });
    });
  }

  protected toggle(event: Event): void {
    event.stopPropagation();
    this.open.update(current => !current);
  }

  protected pickHour(hour: number): void {
    this.hour12.set(hour);
    this.emitValue();
    queueMicrotask(() => this.scrollColumnIntoView(this.hourCol(), hour - 1, this.hours.length));
  }

  protected pickMinute(minute: number): void {
    this.minute.set(minute);
    this.emitValue();
    queueMicrotask(() => this.scrollColumnIntoView(this.minuteCol(), minute, this.minutes.length));
  }

  protected pickPeriod(next: 'AM' | 'PM'): void {
    this.period.set(next);
    this.emitValue();
    queueMicrotask(() =>
      this.scrollColumnIntoView(this.periodCol(), this.periods.indexOf(next), this.periods.length)
    );
  }

  protected pad(value: number): string {
    return padNumber(value);
  }

  private emitValue(): void {
    this.select.emit(to24Hour(this.hour12(), this.minute(), this.period()));
  }

  private teardownInfiniteWheels(): void {
    for (const cleanup of this.wheelCleanups) cleanup();
    this.wheelCleanups = [];
  }

  private scrollSelectionIntoView(): void {
    this.scrollColumnIntoView(this.hourCol(), this.hour12() - 1, this.hours.length, true);
    this.scrollColumnIntoView(this.minuteCol(), this.minute(), this.minutes.length, true);
    this.scrollColumnIntoView(this.periodCol(), this.periods.indexOf(this.period()), this.periods.length);
  }

  /** Indexes directly into the column's children (rather than re-querying
   *  `.time-option--selected`) so this doesn't race Angular's own class
   *  binding update. When a column is looped, picks whichever copy of the
   *  value is closest to the current scroll position — or, on first open
   *  (`preferMiddleCopy`), the middle copy, so there's slack on both sides. */
  private scrollColumnIntoView(
    ref: ElementRef<HTMLElement> | undefined,
    value: number,
    listLength: number,
    preferMiddleCopy = false,
  ): void {
    const el = ref?.nativeElement;
    if (!el) return;
    const copies = Math.max(1, Math.round(el.children.length / listLength));

    let target: HTMLElement | undefined;
    if (preferMiddleCopy) {
      const middleCopy = Math.floor(copies / 2);
      target = el.children[middleCopy * listLength + value] as HTMLElement | undefined;
    } else {
      const viewportCenter = el.scrollTop + el.clientHeight / 2;
      let bestDist = Infinity;
      for (let copy = 0; copy < copies; copy++) {
        const child = el.children[copy * listLength + value] as HTMLElement | undefined;
        if (!child) continue;
        const center = child.offsetTop + child.offsetHeight / 2;
        const dist = Math.abs(center - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          target = child;
        }
      }
    }

    target?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
}

/** Silently jumps the scroll position by one copy's height whenever it
 *  drifts into the first or last copy, so scrolling past either end of the
 *  middle copy feels like it continues into identical content forever. */
function bindInfiniteWheel(el: HTMLElement | undefined, listLength: number): () => void {
  if (!el) return () => {};
  const copies = Math.round(el.children.length / listLength);
  if (copies < 3) return () => {};

  // Measured from actual layout rather than el.scrollHeight / copies, so
  // this stays correct regardless of any container padding.
  const first = el.children[0] as HTMLElement | undefined;
  const nextCopyStart = el.children[listLength] as HTMLElement | undefined;
  if (!first || !nextCopyStart) return () => {};
  const segment = nextCopyStart.offsetTop - first.offsetTop;
  if (!(segment > 0)) return () => {};

  const handler = () => {
    if (el.scrollTop < segment * 0.5) {
      el.scrollTop += segment;
    } else if (el.scrollTop > segment * (copies - 0.5)) {
      el.scrollTop -= segment;
    }
  };
  el.addEventListener('scroll', handler, { passive: true });
  return () => el.removeEventListener('scroll', handler);
}

function repeat<T>(values: readonly T[], times: number): T[] {
  return Array.from({ length: values.length * times }, (_, index) => values[index % values.length]);
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
