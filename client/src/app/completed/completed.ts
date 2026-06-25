import { Component, inject } from '@angular/core';
import { TaskItem } from '../task-item/task-item';
import { TaskStore } from '../task-store';

@Component({
  selector: 'app-completed',
  imports: [TaskItem],
  templateUrl: './completed.html',
  styleUrl: './completed.css',
})
export class Completed {
  store = inject(TaskStore);
}
