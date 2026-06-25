import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProService } from '../pro.service';
import { TaskItem } from '../task-item/task-item';
import { TaskStore } from '../task-store';

@Component({
  selector: 'app-today',
  imports: [TaskItem, RouterLink],
  templateUrl: './today.html',
  styleUrl: './today.css',
})
export class Today {
  store = inject(TaskStore);
  private router = inject(Router);
  protected pro = inject(ProService);

  protected readonly capacityPresets = [4, 6, 8, 10];
  protected readonly longDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  protected activeCapacityHours = computed(() =>
    Math.round(this.store.dayCapacityMinutes() / 60)
  );

  protected weekHasTasks = computed(() =>
    this.store.weekGlance().some(day => day.count > 0)
  );

  protected setCapacity(hours: number): void {
    this.store.setDayCapacityHours(hours);
  }

  protected lightenToday(): void {
    this.store.lightenToday();
  }

  protected openCalendarDay(iso: string): void {
    void this.router.navigate(['/calendar'], { queryParams: { day: iso } });
  }
}
