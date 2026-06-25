import { Injectable, signal } from '@angular/core';
import { EnrichedTask } from './task-store';

export type DetailsView =
  | { kind: 'task'; task: EnrichedTask }
  | { kind: 'day'; iso: string; planFilter: string };

@Injectable({ providedIn: 'root' })
export class TaskDetailsOverlayService {
  readonly view = signal<DetailsView | null>(null);

  open(task: EnrichedTask): void {
    this.view.set({ kind: 'task', task });
  }

  openDay(iso: string, planFilter = '__all__'): void {
    this.view.set({ kind: 'day', iso, planFilter });
  }

  setDayPlanFilter(planFilter: string): void {
    const current = this.view();
    if (current?.kind !== 'day') return;
    this.view.set({ ...current, planFilter });
  }

  close(): void {
    this.view.set(null);
  }
}
