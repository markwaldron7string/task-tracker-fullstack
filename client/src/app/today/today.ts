import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProService } from '../pro.service';
import { TaskItem } from '../task-item/task-item';
import { TaskPickerOverlayService } from '../task-picker-overlay.service';
import { TaskStore } from '../task-store';

const REVIEW_DISMISS_KEY = 'ttf-daily-review-dismissed';

@Component({
  selector: 'app-today',
  imports: [TaskItem, RouterLink],
  templateUrl: './today.html',
  styleUrl: './today.css',
})
export class Today {
  store = inject(TaskStore);
  private router = inject(Router);
  private pickerOverlay = inject(TaskPickerOverlayService);
  protected pro = inject(ProService);

  protected readonly capacityPresets = [4, 6, 8, 10];
  protected readonly longDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  protected reviewDismissed = signal(this.isReviewDismissedToday());

  protected activeCapacityHours = computed(() =>
    Math.round(this.store.dayCapacityMinutes() / 60)
  );

  protected weekHasTasks = computed(() =>
    this.store.weekGlance().some(day => day.count > 0)
  );

  protected showDailyReview = computed(() => {
    const hour = new Date().getHours();
    const hasActivity =
      this.store.completedDueTodayCount() > 0 ||
      this.store.incompleteDueTodayCount() > 0 ||
      this.store.overdueTasks().length > 0;
    return hour >= 16 && hasActivity;
  });

  protected morningBriefing = computed(() => {
    const dueToday = this.store.openDueTodayCount();
    const overdue = this.store.overdueTasks().length;
    const planned = this.store.todayEstimatedLabel();
    const capacity = this.store.dayCapacityLabel();

    if (dueToday === 0 && overdue === 0) {
      return 'Clear calendar today — capture something new or enjoy the breathing room.';
    }

    const parts: string[] = [];
    if (overdue > 0) parts.push(`${overdue} overdue`);
    if (dueToday > 0) parts.push(`${dueToday} due today`);
    const load =
      this.store.todayEstimatedMinutes() > 0
        ? ` · ~${planned} planned of ${capacity}`
        : '';
    return `Good morning — ${parts.join(', ')}${load}.`;
  });

  protected setCapacity(hours: number): void {
    this.store.setDayCapacityHours(hours);
  }

  protected lightenToday(): void {
    this.store.lightenToday();
  }

  protected openReschedulePicker(): void {
    const taskIds = this.store.dueTodayTasks().map(task => task.id);
    this.pickerOverlay.openBulkReschedule(taskIds);
  }

  protected dismissReview(): void {
    this.reviewDismissed.set(true);
    localStorage.setItem(REVIEW_DISMISS_KEY, todayKey());
  }

  protected reopenReview(): void {
    this.reviewDismissed.set(false);
    localStorage.removeItem(REVIEW_DISMISS_KEY);
  }

  protected openCalendarDay(iso: string): void {
    void this.router.navigate(['/calendar'], { queryParams: { day: iso } });
  }

  private isReviewDismissedToday(): boolean {
    return localStorage.getItem(REVIEW_DISMISS_KEY) === todayKey();
  }
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}
