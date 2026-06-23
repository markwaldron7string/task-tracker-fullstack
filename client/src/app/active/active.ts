import { Component, inject } from '@angular/core';
import { TaskStore } from '../task-store';

@Component({
  selector: 'app-active',
  templateUrl: './active.html',
  styleUrl: './active.css',
})
export class Active {
  store = inject(TaskStore);
}
