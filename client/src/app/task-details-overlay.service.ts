import { Injectable, signal } from '@angular/core';
import { EnrichedTask } from './task-store';

@Injectable({ providedIn: 'root' })
export class TaskDetailsOverlayService {
  readonly task = signal<EnrichedTask | null>(null);

  open(task: EnrichedTask): void {
    this.task.set(task);
  }

  close(): void {
    this.task.set(null);
  }
}
