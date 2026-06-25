import { Injectable, signal } from '@angular/core';

export interface DuePickerState {
  taskId: number;
  due: string | null;
}

export interface EstimatePickerState {
  taskId: number;
  estimateMinutes: number | null;
}

export interface BulkRescheduleState {
  taskIds: number[];
}

@Injectable({ providedIn: 'root' })
export class TaskPickerOverlayService {
  readonly duePicker = signal<DuePickerState | null>(null);
  readonly estimatePicker = signal<EstimatePickerState | null>(null);
  readonly bulkReschedule = signal<BulkRescheduleState | null>(null);

  openDue(taskId: number, due: string | null): void {
    this.estimatePicker.set(null);
    this.bulkReschedule.set(null);
    const current = this.duePicker();
    if (current?.taskId === taskId) {
      this.duePicker.set(null);
      return;
    }
    this.duePicker.set({ taskId, due });
  }

  openEstimate(taskId: number, estimateMinutes: number | null): void {
    this.duePicker.set(null);
    this.bulkReschedule.set(null);
    const current = this.estimatePicker();
    if (current?.taskId === taskId) {
      this.estimatePicker.set(null);
      return;
    }
    this.estimatePicker.set({ taskId, estimateMinutes });
  }

  openBulkReschedule(taskIds: number[]): void {
    this.duePicker.set(null);
    this.estimatePicker.set(null);
    if (taskIds.length === 0) {
      this.bulkReschedule.set(null);
      return;
    }
    this.bulkReschedule.set({ taskIds });
  }

  close(): void {
    this.duePicker.set(null);
    this.estimatePicker.set(null);
    this.bulkReschedule.set(null);
  }

  isDueOpen(taskId: number): boolean {
    return this.duePicker()?.taskId === taskId;
  }

  isEstimateOpen(taskId: number): boolean {
    return this.estimatePicker()?.taskId === taskId;
  }
}
