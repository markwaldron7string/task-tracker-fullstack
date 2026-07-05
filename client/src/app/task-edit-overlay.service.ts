import { Injectable, signal } from '@angular/core';
import { Task } from './task-store';

@Injectable({ providedIn: 'root' })
export class TaskEditOverlayService {
  readonly task = signal<Task | null>(null);

  open(task: Task): void {
    this.task.set(task);
  }

  close(): void {
    this.task.set(null);
  }
}
