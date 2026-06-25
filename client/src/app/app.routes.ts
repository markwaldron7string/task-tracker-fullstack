import { Routes } from '@angular/router';
import { TaskList } from './task-list/task-list';
import { Completed } from './completed/completed';
import { Active } from './active/active';
import { Today } from './today/today';
import { Calendar } from './calendar/calendar';
import { Upgrade } from './upgrade/upgrade';

export const routes: Routes = [
  { path: '', component: TaskList },
  { path: 'today', component: Today },
  { path: 'calendar', component: Calendar },
  { path: 'completed', component: Completed },
  { path: 'active', component: Active },
  { path: 'upgrade', component: Upgrade },
];