import { Component, inject } from '@angular/core';
import { TaskItem } from '../task-item/task-item';
import { TaskSummary } from '../task-summary/task-summary';
import { TaskStore } from '../task-store';

@Component({
  selector: 'app-task-list',
  imports: [TaskItem, TaskSummary],
  templateUrl: './task-list.html',
  styleUrl: './task-list.css',
})
export class TaskList {
  store = inject(TaskStore);
}
