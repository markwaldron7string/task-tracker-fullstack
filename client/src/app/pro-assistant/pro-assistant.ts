import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { injectOverlayDismissBinding } from '../overlay-dismiss.service';
import { Router } from '@angular/router';
import { CoachApiService } from '../coach-api.service';
import {
  answerCoachQuestion,
  buildCoachSuggestions,
  buildClarifyingReply,
  buildLocalOverview,
  buildLocalSchedule,
  buildLocalGenericPlan,
  buildLocalWellnessPlan,
  buildLocalWorkoutPlan,
  buildPlanSummaryTag,
  CoachScheduleAssignment,
  CoachSuggestion,
  CoachTaskSnapshot,
  CoachChatTurn,
  formatScheduleDue,
  isCoachAwaitingReply,
  isScheduleRequest,
  isVagueCoachInput,
  reviseLocalSchedule,
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
  private host = inject(ElementRef<HTMLElement>);
  protected pro = inject(ProService);

  protected open = signal(false);
  protected chatInput = signal('');
  protected chatReply = signal<string | null>(null);
  protected chatSource = signal<'ai' | 'local' | null>(null);
  protected chatFromClient = signal(false);
  protected scheduleProposal = signal<CoachScheduleAssignment[] | null>(null);
  protected scheduleOverview = signal<string | null>(null);
  protected overviewOpen = signal(false);
  protected schedulePreviewId = signal<string | null>(null);
  protected thinking = signal(false);
  protected awaitingReply = signal(false);
  private chatHistory = signal<CoachChatTurn[]>([]);
  private lastPlanQuestion = signal('');
  private currentPlanLabel = signal<string | null>(null);

  protected formatScheduleDue = formatScheduleDue;

  protected followUpChips = [
    'Make weekends lighter',
    'Shorten daily tasks',
    'Remove the last day',
    'Add more rest days',
  ];

  private snapshot = computed<CoachTaskSnapshot>(() => ({
    overdueCount: this.store.overdueTasks().length,
    dueTodayCount: this.store.openDueTodayCount(),
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

  constructor() {
    injectOverlayDismissBinding(() => {
      if (!this.open()) return null;
      return {
        contains: target => {
          const root = this.host.nativeElement;
          const panel = root.querySelector('.coach-panel');
          const scrim = root.querySelector('.coach-scrim');
          return !!(
            (panel && panel.contains(target))
            || (scrim && scrim.contains(target))
          );
        },
        close: () => this.minimize(),
      };
    });
  }

  protected toggleFab(): void {
    this.syncHeaderHeight();
    document.body.style.overflow = 'hidden';
    this.open.set(true);
  }

  protected minimize(): void {
    this.open.set(false);
    document.body.style.overflow = '';
  }

  protected close(): void {
    this.open.set(false);
    document.body.style.overflow = '';
    this.resetChat();
  }

  private syncHeaderHeight(): void {
    const header = document.querySelector('header');
    if (!header) return;
    document.documentElement.style.setProperty(
      '--app-header-height',
      `${Math.ceil(header.getBoundingClientRect().height)}px`
    );
  }

  protected toggleOverview(): void {
    this.overviewOpen.update(open => !open);
  }

  protected async askCoach(input: HTMLInputElement): Promise<void> {
    const question = input.value.trim();
    if (!question) return;

    const wasAwaitingReply = this.awaitingReply();
    const isFreshVagueAsk = isVagueCoachInput(question) && !wasAwaitingReply;
    const history = this.historyForCoach(question, wasAwaitingReply);
    const isNewPlan = !isFreshVagueAsk && isScheduleRequest(question, history);

    this.thinking.set(true);
    this.chatInput.set(question);
    this.chatReply.set(null);
    this.chatSource.set(null);
    this.chatFromClient.set(false);
    this.awaitingReply.set(false);

    if (isFreshVagueAsk) {
      this.chatHistory.set([]);
      this.scheduleProposal.set(null);
      this.scheduleOverview.set(null);
      this.overviewOpen.set(false);
      this.schedulePreviewId.set(null);
      this.lastPlanQuestion.set('');
    } else if (isNewPlan) {
      this.scheduleProposal.set(null);
      this.scheduleOverview.set(null);
      this.overviewOpen.set(false);
      this.schedulePreviewId.set(null);
    }
    input.value = '';

    const snapshot = this.snapshot();
    const apiReply = await this.coachApi.chat(question, snapshot, history);

    if (apiReply?.text) {
      if (isFreshVagueAsk && apiReply.schedule.length === 0) {
        const clarifying = this.clarifyingReplyFromApi(question, apiReply);
        this.appendChatTurn('user', question);
        this.appendChatTurn('assistant', clarifying);
        this.chatReply.set(clarifying);
        this.chatSource.set(apiReply.source);
        this.chatFromClient.set(false);
        this.setAwaitingReply(true, clarifying);
        this.thinking.set(false);
        return;
      }

      this.appendChatTurn('user', question);
      this.appendChatTurn('assistant', apiReply.text);
      this.chatReply.set(apiReply.text);
      this.chatSource.set(apiReply.source);
      this.chatFromClient.set(false);
      if (apiReply.schedule.length > 0) {
        this.applyScheduleResult(apiReply.schedule, apiReply.overview, question);
        this.awaitingReply.set(false);
      } else {
        this.setAwaitingReply(apiReply.awaitingReply, apiReply.text);
      }
      this.thinking.set(false);
      return;
    }

    if (isFreshVagueAsk) {
      const clarifying = buildClarifyingReply(question);
      this.appendChatTurn('user', question);
      this.appendChatTurn('assistant', clarifying);
      this.chatReply.set(clarifying);
      this.chatSource.set(null);
      this.chatFromClient.set(true);
      this.setAwaitingReply(true, clarifying);
      this.thinking.set(false);
      return;
    }

    await this.applyLocalReply(question, history, isNewPlan);
    this.thinking.set(false);
  }

  protected async askFollowUp(input: HTMLInputElement): Promise<void> {
    const question = input.value.trim();
    const schedule = this.scheduleProposal();
    if (!question || !schedule?.length) return;

    this.thinking.set(true);
    this.chatInput.set(question);
    this.chatReply.set(null);
    this.chatSource.set(null);
    this.chatFromClient.set(false);
    input.value = '';

    const snapshot = this.snapshot();
    const history = this.chatHistory();
    const planQuestion = this.lastPlanQuestion() || planQuestionFromHistory(history, question);
    const apiReply = await this.coachApi.chat(question, snapshot, history, {
      currentSchedule: schedule,
      reviseSchedule: true,
    });

    if (apiReply?.text) {
      this.appendChatTurn('user', question);
      this.appendChatTurn('assistant', apiReply.text);
      this.chatReply.set(apiReply.text);
      this.chatSource.set(apiReply.source);
      this.chatFromClient.set(false);
      const revised = apiReply.schedule.length > 0 ? apiReply.schedule : schedule;
      this.applyScheduleResult(revised, apiReply.overview, planQuestion);
      if (apiReply.schedule.length === 0) {
        this.scheduleProposal.set(revised);
        this.scheduleOverview.set(
          apiReply.overview ?? buildLocalOverview(revised, planQuestion)
        );
      }
      this.thinking.set(false);
      return;
    }

    const revised = reviseLocalSchedule(question, schedule);
    const overview = buildLocalOverview(revised, planQuestion);
    const reply = 'Updated the plan based on your feedback. Review the changes below.';
    this.appendChatTurn('user', question);
    this.appendChatTurn('assistant', reply);
    this.chatReply.set(reply);
    this.chatFromClient.set(true);
    this.applyScheduleResult(revised, overview, planQuestion);
    this.thinking.set(false);
  }

  protected applySchedule(): void {
    const proposal = this.scheduleProposal();
    if (!proposal?.length) return;

    const applied = this.store.applySchedule(proposal, this.currentPlanLabel() ?? this.chatReply());
    this.scheduleProposal.set(null);
    this.scheduleOverview.set(null);
    this.overviewOpen.set(false);
    this.schedulePreviewId.set(null);
    this.lastPlanQuestion.set('');
    this.currentPlanLabel.set(null);
    this.chatReply.set(`Applied ${applied} task${applied === 1 ? '' : 's'} to your calendar.`);
    this.minimize();
    void this.router.navigate(['/calendar']);
  }

  protected dismissSchedule(): void {
    this.scheduleProposal.set(null);
    this.scheduleOverview.set(null);
    this.overviewOpen.set(false);
    this.schedulePreviewId.set(null);
    this.lastPlanQuestion.set('');
    this.currentPlanLabel.set(null);
    this.awaitingReply.set(false);
    this.chatHistory.set([]);
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

  protected quickFollowUp(prompt: string, input: HTMLInputElement): void {
    input.value = prompt;
    void this.askFollowUp(input);
  }

  private async applyLocalReply(question: string, history: CoachChatTurn[], isNewPlan: boolean): Promise<void> {
    const localReply = answerCoachQuestion(question, this.snapshot(), history);
    this.appendChatTurn('user', question);
    this.appendChatTurn('assistant', localReply.text);
    this.chatReply.set(localReply.text);
    this.chatSource.set(null);
    this.chatFromClient.set(true);

    if (!isNewPlan) {
      this.setAwaitingReply(isCoachAwaitingReply(localReply.text), localReply.text);
      return;
    }

    const planQuestion = planQuestionFromHistory(history, question);
    const wellness = buildLocalWellnessPlan(planQuestion);
    const workout = wellness.length > 0 ? wellness : buildLocalWorkoutPlan(planQuestion);
    const themed = workout.length > 0 ? workout : buildLocalGenericPlan(planQuestion);
    const schedule = themed.length > 0 ? themed : buildLocalSchedule(this.store.activeEnrichedTasks());

    if (schedule.length === 0) return;

    const isNewPlanTasks = schedule.every(item => item.taskId == null);
    const summary = isNewPlanTasks
      ? buildPlanSummaryTag(schedule, planQuestion)
      : `I spread ${schedule.length} unscheduled task${schedule.length === 1 ? '' : 's'} across the next open weekdays. Review the plan below and apply it to your calendar.`;

    this.chatReply.set(summary);
    this.chatHistory.update(turns => {
      const next = [...turns];
      if (next.length > 0 && next[next.length - 1].role === 'assistant') {
        next[next.length - 1] = { role: 'assistant', content: summary };
      }
      return next;
    });
    this.applyScheduleResult(schedule, buildLocalOverview(schedule, planQuestion), planQuestion);
    this.awaitingReply.set(false);
  }

  private setAwaitingReply(explicit: boolean, text: string): void {
    this.awaitingReply.set(explicit || isCoachAwaitingReply(text));
  }

  private applyScheduleResult(
    schedule: CoachScheduleAssignment[],
    overview: string | null,
    planQuestion: string
  ): void {
    this.scheduleProposal.set(schedule);
    this.scheduleOverview.set(overview ?? buildLocalOverview(schedule, planQuestion));
    this.lastPlanQuestion.set(planQuestion);
    this.currentPlanLabel.set(this.chatReply()?.trim() || buildPlanSummaryTag(schedule, planQuestion));
    this.overviewOpen.set(false);
    this.schedulePreviewId.set(null);
  }

  private resetChat(): void {
    this.chatReply.set(null);
    this.chatSource.set(null);
    this.chatFromClient.set(false);
    this.scheduleProposal.set(null);
    this.scheduleOverview.set(null);
    this.overviewOpen.set(false);
    this.schedulePreviewId.set(null);
    this.chatInput.set('');
    this.chatHistory.set([]);
    this.lastPlanQuestion.set('');
    this.currentPlanLabel.set(null);
    this.awaitingReply.set(false);
  }

  private historyForCoach(question: string, wasAwaitingReply: boolean): CoachChatTurn[] {
    if (wasAwaitingReply) return this.chatHistory();
    if (isVagueCoachInput(question)) return [];
    return this.chatHistory();
  }

  private clarifyingReplyFromApi(
    question: string,
    apiReply: { text: string; schedule: CoachScheduleAssignment[]; awaitingReply: boolean }
  ): string {
    if (
      apiReply.schedule.length === 0 &&
      (apiReply.awaitingReply || isCoachAwaitingReply(apiReply.text))
    ) {
      return apiReply.text;
    }
    return buildClarifyingReply(question);
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
    if (turn.role !== 'user' || isVagueCoachInput(turn.content)) continue;
    if (
      /\b(\d+\s*day|workout|training|routine|habit|mental health|wellness|mindfulness)\b/i.test(turn.content)
    ) {
      return turn.content;
    }
  }
  return question;
}
