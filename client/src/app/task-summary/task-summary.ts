import { Component, inject } from '@angular/core';
import { TaskStore } from '../task-store';

@Component({
  selector: 'app-task-summary',
  templateUrl: './task-summary.html',
  styleUrl: './task-summary.css',
})
export class TaskSummary {
  store = inject(TaskStore);
}
