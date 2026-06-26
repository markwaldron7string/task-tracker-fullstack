import { Injectable, signal } from '@angular/core';

export interface BulkRescheduleState {
  taskIds: number[];
}

@Injectable({ providedIn: 'root' })
export class TaskPickerOverlayService {
  readonly bulkReschedule = signal<BulkRescheduleState | null>(null);

  openBulkReschedule(taskIds: number[]): void {
    if (taskIds.length === 0) {
      this.bulkReschedule.set(null);
      return;
    }
    this.bulkReschedule.set({ taskIds });
  }

  close(): void {
    this.bulkReschedule.set(null);
  }
}
