import { Routes } from '@angular/router';
import { TaskList } from './task-list/task-list';
import { Completed } from './completed/completed';
import { Active } from './active/active';

export const routes: Routes = [
  { path: '', component: TaskList },
  { path: 'completed', component: Completed },
  { path: 'active', component: Active },
];