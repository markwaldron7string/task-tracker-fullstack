import { Component, inject } from '@angular/core';
import { TaskItem } from '../task-item/task-item';
import { TaskStore } from '../task-store';

@Component({
  selector: 'app-active',
  imports: [TaskItem],
  templateUrl: './active.html',
  styleUrl: './active.css',
})
export class Active {
  store = inject(TaskStore);
}
