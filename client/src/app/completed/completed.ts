import { Component, inject } from '@angular/core';
import { TaskStore } from '../task-store';

@Component({
  selector: 'app-completed',
  templateUrl: './completed.html',
  styleUrl: './completed.css',
})
export class Completed {
  store = inject(TaskStore);
}
