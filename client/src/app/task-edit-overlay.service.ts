import { Injectable, signal } from '@angular/core';
import { EnrichedTask } from './task-store';

@Injectable({ providedIn: 'root' })
export class TaskEditOverlayService {
  readonly task = signal<EnrichedTask | null>(null);

  open(task: EnrichedTask): void {
    const header = document.querySelector('header');
    if (header) {
      document.documentElement.style.setProperty(
        '--app-header-height',
        `${Math.ceil(header.getBoundingClientRect().height)}px`
      );
    }
    this.task.set(task);
  }

  close(): void {
    this.task.set(null);
  }
}
