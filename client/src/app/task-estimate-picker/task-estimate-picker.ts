import { Component, input, output } from '@angular/core';
import { parseEstimateInput } from '../task-quick-parse';

const PRESETS: Array<{ label: string; minutes: number | null }> = [
  { label: 'None', minutes: null },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '1h', minutes: 60 },
  { label: '1.5h', minutes: 90 },
  { label: '2h', minutes: 120 },
];

@Component({
  selector: 'app-task-estimate-picker',
  templateUrl: './task-estimate-picker.html',
  styleUrl: './task-estimate-picker.css',
})
export class TaskEstimatePicker {
  value = input<number | null>(null);

  select = output<number | null>();
  dismiss = output<void>();

  protected readonly presets = PRESETS;
  protected customValue = '';

  protected onPanelClick(event: Event): void {
    event.stopPropagation();
  }

  protected pickPreset(minutes: number | null): void {
    this.select.emit(minutes);
  }

  protected applyCustom(input: HTMLInputElement): void {
    const parsed = parseEstimateInput(input.value);
    if (input.value.trim() && parsed === null) return;
    this.select.emit(parsed);
  }
}
