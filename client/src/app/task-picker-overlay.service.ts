import { Injectable, signal } from '@angular/core';

export interface DuePickerState {
  taskId: number;
  due: string | null;
}

export interface EstimatePickerState {
  taskId: number;
  estimateMinutes: number | null;
}

@Injectable({ providedIn: 'root' })
export class TaskPickerOverlayService {
  readonly duePicker = signal<DuePickerState | null>(null);
  readonly estimatePicker = signal<EstimatePickerState | null>(null);

  openDue(taskId: number, due: string | null): void {
    this.estimatePicker.set(null);
    const current = this.duePicker();
    if (current?.taskId === taskId) {
      this.duePicker.set(null);
      return;
    }
    this.duePicker.set({ taskId, due });
  }

  openEstimate(taskId: number, estimateMinutes: number | null): void {
    this.duePicker.set(null);
    const current = this.estimatePicker();
    if (current?.taskId === taskId) {
      this.estimatePicker.set(null);
      return;
    }
    this.estimatePicker.set({ taskId, estimateMinutes });
  }

  close(): void {
    this.duePicker.set(null);
    this.estimatePicker.set(null);
  }

  isDueOpen(taskId: number): boolean {
    return this.duePicker()?.taskId === taskId;
  }

  isEstimateOpen(taskId: number): boolean {
    return this.estimatePicker()?.taskId === taskId;
  }
}
