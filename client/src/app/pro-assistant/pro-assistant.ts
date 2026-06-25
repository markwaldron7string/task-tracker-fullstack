import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CoachApiService } from '../coach-api.service';
import {
  answerCoachQuestion,
  buildCoachSuggestions,
  buildLocalSchedule,
  CoachScheduleAssignment,
  CoachSuggestion,
  CoachTaskSnapshot,
  CoachChatTurn,
  formatScheduleDue,
  buildLocalWorkoutPlan,
  isScheduleRequest,
} from '../pro-coach';
import { ProService } from '../pro.service';
import { TaskStore } from '../task-store';

@Component({
  selector: 'app-pro-assistant',
  templateUrl: './pro-assistant.html',
  styleUrl: './pro-assistant.css',
})
export class ProAssistant {
  private store = inject(TaskStore);
  private router = inject(Router);
  private coachApi = inject(CoachApiService);
  protected pro = inject(ProService);

  protected open = signal(false);
  protected chatInput = signal('');
  protected chatReply = signal<string | null>(null);
  protected chatSource = signal<'ai' | 'local' | null>(null);
  protected chatFromClient = signal(false);
  protected scheduleProposal = signal<CoachScheduleAssignment[] | null>(null);
  protected schedulePreviewId = signal<string | null>(null);
  protected thinking = signal(false);
  private chatHistory = signal<CoachChatTurn[]>([]);

  protected formatScheduleDue = formatScheduleDue;

  private snapshot = computed<CoachTaskSnapshot>(() => ({
    overdueCount: this.store.overdueTasks().length,
    dueTodayCount: this.store.dueTodayTasks().length,
    upcomingCount: this.store.upcomingTasks().length,
    unscheduledCount: this.store.unscheduledActiveTasks().length,
    isOvercommitted: this.store.isOvercommitted(),
    todayEstimatedLabel: this.store.todayEstimatedLabel(),
    dayCapacityLabel: this.store.dayCapacityLabel(),
    topOverdueTitles: this.store.overdueTasks().slice(0, 2).map(task => task.title),
    topUnscheduledTitles: this.store.unscheduledActiveTasks().slice(0, 2).map(task => task.title),
    highPriorityOpenCount: this.store.activeEnrichedTasks().filter(task => task.priority === 'high').length,
  }));

  protected suggestions = computed(() => buildCoachSuggestions(this.snapshot()));

  protected toggleFab(): void {
    this.open.set(true);
  }

  protected minimize(): void {
    this.open.set(false);
  }

  protected close(): void {
    this.open.set(false);
    this.resetChat();
  }

  protected async askCoach(input: HTMLInputElement): Promise<void> {
    const question = input.value.trim();
    if (!question) return;

    this.thinking.set(true);
    this.chatInput.set(question);
    this.chatReply.set(null);
    this.chatSource.set(null);
    this.chatFromClient.set(false);
    this.scheduleProposal.set(null);
    input.value = '';

    const snapshot = this.snapshot();
    const history = this.chatHistory();
    const apiReply = await this.coachApi.chat(question, snapshot, history);

    if (apiReply?.text) {
      this.appendChatTurn('user', question);
      this.appendChatTurn('assistant', apiReply.text);
      this.chatReply.set(apiReply.text);
      this.chatSource.set(apiReply.source);
      this.chatFromClient.set(false);
      this.scheduleProposal.set(apiReply.schedule.length > 0 ? apiReply.schedule : null);
      this.thinking.set(false);
      return;
    }

    const localReply = answerCoachQuestion(question, snapshot);
    this.appendChatTurn('user', question);
    this.appendChatTurn('assistant', localReply.text);
    this.chatReply.set(localReply.text);
    this.chatSource.set(null);
    this.chatFromClient.set(true);

    if (isScheduleRequest(question, history)) {
      const planQuestion = planQuestionFromHistory(history, question);
      const workout = buildLocalWorkoutPlan(planQuestion);
      const schedule = workout.length > 0 ? workout : buildLocalSchedule(this.store.activeEnrichedTasks());
      this.scheduleProposal.set(schedule.length > 0 ? schedule : null);
      if (schedule.length > 0) {
        const isNewPlan = schedule.every(item => item.taskId == null);
        this.chatReply.set(
          isNewPlan
            ? `I created a ${schedule.length}-day plan with new calendar tasks. Review below and apply to your calendar.`
            : `I spread ${schedule.length} unscheduled task${schedule.length === 1 ? '' : 's'} across the next open weekdays. Review the plan below and apply it to your calendar.`
        );
        this.chatHistory.update(turns => {
          const next = [...turns];
          if (next.length > 0 && next[next.length - 1].role === 'assistant') {
            next[next.length - 1] = { role: 'assistant', content: this.chatReply()! };
          }
          return next;
        });
      }
    }

    this.thinking.set(false);
  }

  protected applySchedule(): void {
    const proposal = this.scheduleProposal();
    if (!proposal?.length) return;

    const applied = this.store.applySchedule(proposal);
    this.scheduleProposal.set(null);
    this.schedulePreviewId.set(null);
    this.chatReply.set(`Applied ${applied} task${applied === 1 ? '' : 's'} to your calendar.`);
    this.minimize();
    void this.router.navigate(['/calendar']);
  }

  protected dismissSchedule(): void {
    this.scheduleProposal.set(null);
    this.schedulePreviewId.set(null);
  }

  protected scheduleItemId(item: CoachScheduleAssignment): string {
    return `${item.due}:${item.taskId ?? item.title ?? ''}`;
  }

  protected toggleSchedulePreview(item: CoachScheduleAssignment): void {
    const id = this.scheduleItemId(item);
    this.schedulePreviewId.update(current => (current === id ? null : id));
  }

  protected isSchedulePreviewOpen(item: CoachScheduleAssignment): boolean {
    return this.schedulePreviewId() === this.scheduleItemId(item);
  }

  protected runSuggestion(suggestion: CoachSuggestion): void {
    switch (suggestion.actionType) {
      case 'roll-overdue':
        this.store.rollOverdueToToday();
        break;
      case 'open-calendar':
        void this.router.navigate(['/calendar']);
        break;
      case 'lighten-today':
        this.store.lightenToday();
        break;
      default:
        break;
    }
  }

  protected quickAsk(prompt: string, input: HTMLInputElement): void {
    input.value = prompt;
    void this.askCoach(input);
  }

  private resetChat(): void {
    this.chatReply.set(null);
    this.chatSource.set(null);
    this.chatFromClient.set(false);
    this.scheduleProposal.set(null);
    this.schedulePreviewId.set(null);
    this.chatInput.set('');
    this.chatHistory.set([]);
  }

  private appendChatTurn(role: CoachChatTurn['role'], content: string): void {
    const trimmed = content.trim();
    if (!trimmed) return;
    this.chatHistory.update(turns => [...turns, { role, content: trimmed }].slice(-8));
  }
}

function planQuestionFromHistory(history: CoachChatTurn[], question: string): string {
  const combined = [...history, { role: 'user' as const, content: question }];
  for (let index = combined.length - 1; index >= 0; index--) {
    const turn = combined[index];
    if (turn.role === 'user' && /\b(\d+\s*day|workout|training|routine|habit)\b/i.test(turn.content)) {
      return turn.content;
    }
  }
  return question;
}
