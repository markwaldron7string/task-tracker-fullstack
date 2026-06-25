export type CoachSuggestionKind = 'focus' | 'schedule' | 'capacity' | 'insight';

export interface CoachSuggestion {
  id: string;
  kind: CoachSuggestionKind;
  title: string;
  body: string;
  actionLabel?: string;
  actionType?: 'roll-overdue' | 'open-calendar' | 'lighten-today';
}

export interface CoachTaskSnapshot {
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
  unscheduledCount: number;
  isOvercommitted: boolean;
  todayEstimatedLabel: string;
  dayCapacityLabel: string;
  topOverdueTitles: string[];
  topUnscheduledTitles: string[];
  highPriorityOpenCount: number;
}

export interface CoachChatReply {
  text: string;
  suggestions: CoachSuggestion[];
}

export interface CoachScheduleAssignment {
  taskId?: number | null;
  due: string;
  title?: string;
  estimateMinutes?: number | null;
  checklist?: Array<{ id?: string; title: string; done?: boolean }>;
}

export interface CoachChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const SCHEDULE_INTENT =
  /\b(schedule|plan|build\s+(a\s+)?schedule|assign|spread|calendar|this\s+week|next\s+week|week\s+plan|routine|program|workout|habit)\b/i;
const MULTI_DAY_PLAN_INTENT = /\b(\d+\s*day|month|weekly|routine|workout|training|habit|mental health|wellness|mindfulness|well-being|wellbeing)\b/i;
const CONFIRMATION_INTENT =
  /^(ok|okay|yes|yep|yeah|sure|do it|go ahead|proceed|sounds good|let'?s do it|please do|apply it|create it|make it)\.?!?$/i;

export function isScheduleRequest(question: string, history: CoachChatTurn[] = []): boolean {
  const trimmed = question.trim();
  if (!trimmed) return false;
  if (isVagueCoachInput(trimmed)) return false;
  if (SCHEDULE_INTENT.test(trimmed) || MULTI_DAY_PLAN_INTENT.test(trimmed)) return true;
  return CONFIRMATION_INTENT.test(trimmed) && historyIndicatesPendingPlan(history);
}

export function isCoachAwaitingReply(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.endsWith('?')) return true;
  if (/\blet me know\b/i.test(trimmed)) return true;
  if (/\btell me\b/i.test(trimmed) && /\b(when|if|what|how|ready)\b/i.test(trimmed)) return true;
  if (/\b(ready for me to|when you're ready|if you're ready|should I|would you like|do you want)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function isVagueCoachInput(question: string): boolean {
  const trimmed = question.trim();
  if (!trimmed) return false;
  if (CONFIRMATION_INTENT.test(trimmed)) return false;

  const lower = trimmed.toLowerCase();
  if (/overdue|today|focus|overcommit|capacity|priority|tomorrow/.test(lower)) return false;
  if (/\d+\s*day/i.test(trimmed)) return false;
  if (/mental health|wellness|mindfulness|workout|training|this week|next week|for this week/i.test(trimmed)) return false;

  if (/^(help(\s+me)?|plan(s|ning)?|schedule)\.?$/i.test(trimmed)) return true;
  if (/^(make|create|build)\s+(a\s+)?(plan|schedule)\.?$/i.test(trimmed)) return true;
  if (/^(i\s+)?(need|want)\s+(a\s+)?(plan|schedule|help)\.?$/i.test(trimmed)) return true;

  const words = trimmed.split(/\s+/);
  if (words.length <= 2 && !/\d/.test(trimmed)) return true;

  if (
    words.length <= 4 &&
    /\b(plan|schedule|help|something|better|health|fitness|wellness)\b/i.test(trimmed) &&
    !/\d+\s*day|week|workout|mental|mindfulness|today|overdue/i.test(trimmed)
  ) {
    return true;
  }

  return false;
}

export function buildClarifyingReply(question: string): string {
  const lower = question.trim().toLowerCase();
  if (/health|wellness|better|feel|mind/.test(lower)) {
    return 'Are you thinking about mental wellness, physical fitness, or something else — and how many days should the plan run?';
  }
  if (/plan|schedule/.test(lower)) {
    return 'Happy to help — should I schedule your existing tasks, or create a new multi-day plan (workout, wellness, habits)? How many days?';
  }
  return 'What would be most helpful right now — focus for today, a multi-day plan, or help placing tasks on your calendar?';
}

function historyIndicatesPendingPlan(history: CoachChatTurn[]): boolean {
  if (history.length === 0) return false;

  const recent = history.slice(-4);
  for (const message of recent) {
    if (message.role !== 'assistant') continue;
    if (isCoachAwaitingReply(message.content)) continue;
    if (/\b(schedule|calendar|workout|plan|routine|apply|ready for you to apply|proposed)\b/i.test(message.content)) {
      return true;
    }
  }

  return recent.some(
    message =>
      message.role === 'user' &&
      !isVagueCoachInput(message.content) &&
      (SCHEDULE_INTENT.test(message.content) || MULTI_DAY_PLAN_INTENT.test(message.content))
  );
}

export function buildLocalSchedule(
  tasks: Array<{ id: number; title: string; due: string | null; priority: string }>
): CoachScheduleAssignment[] {
  const priorityRank: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };
  const candidates = tasks
    .filter(task => !task.due)
    .sort((a, b) => (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0) || a.id - b.id)
    .slice(0, 7);

  if (candidates.length === 0) return [];

  const assignments: CoachScheduleAssignment[] = [];
  let day = new Date();

  for (const task of candidates) {
    if (assignments.length > 0) day = addDays(day, 1);
    day = nextWeekday(day);
    assignments.push({
      taskId: task.id,
      due: formatIso(day),
      title: task.title,
    });
  }

  return assignments;
}

export function buildLocalWorkoutPlan(question: string, maxDays = 31): CoachScheduleAssignment[] {
  const match = question.match(/(\d+)\s*day/i);
  const days = match ? Math.min(parseInt(match[1], 10), maxDays) : 0;
  if (days < 3 || !/\b(workout|training|exercise|habit|routine)\b/i.test(question)) return [];

  const includesMeals = /\b(meal|diet|nutrition|fat|food)\b/i.test(question);
  const assignments: CoachScheduleAssignment[] = [];
  let day = new Date();

  for (let index = 0; index < days; index++) {
    if (index > 0) day = addDays(day, 1);
    day = nextWeekday(day);
    assignments.push({
      due: formatIso(day),
      title: `Workout Day ${index + 1}`,
      estimateMinutes: 45,
      checklist: buildLocalDayChecklist(index, includesMeals),
    });
  }

  return assignments;
}

export function buildLocalWellnessPlan(question: string, maxDays = 31): CoachScheduleAssignment[] {
  const match = question.match(/(\d+)\s*day/i);
  const days = match ? Math.min(parseInt(match[1], 10), maxDays) : 0;
  if (days < 3 || !/\b(mental health|wellness|mindfulness|well-being|wellbeing)\b/i.test(question)) return [];

  const themes = [
    'Morning Mindfulness',
    'Nature Walk',
    'Gratitude & Journaling',
    'Gentle Movement',
    'Social Connection',
    'Creative Expression',
    'Rest & Recovery',
  ];

  const assignments: CoachScheduleAssignment[] = [];
  let day = new Date();

  for (let index = 0; index < days; index++) {
    if (index > 0) day = addDays(day, 1);
    day = nextWeekday(day);
    const theme = themes[index % themes.length];
    assignments.push({
      due: formatIso(day),
      title: `Day ${index + 1} – ${theme}`,
      estimateMinutes: 30,
      checklist: [
        { title: '5 min breathing exercise', done: false },
        { title: '10 min mindful walk outside', done: false },
        { title: "Write 3 things you're grateful for", done: false },
        { title: 'Evening check-in: rate mood 1–5', done: false },
      ],
    });
  }

  return assignments;
}

export function reviseLocalSchedule(
  question: string,
  currentSchedule: CoachScheduleAssignment[]
): CoachScheduleAssignment[] {
  const lower = question.toLowerCase();
  let revised = currentSchedule.map(item => ({ ...item, checklist: item.checklist?.map(step => ({ ...step })) }));

  if (/\b(rest|lighter|lighten|easier|fewer)\b/.test(lower)) {
    revised = revised.map((item, index) =>
      index % 2 === 1 && /\b(rest|lighter|lighten|easier)\b/.test(lower)
        ? {
            ...item,
            title: `Rest day – ${item.title ?? 'Recovery'}`,
            estimateMinutes: 20,
            checklist: [
              { title: '20 min easy walk', done: false },
              { title: '10 min stretching', done: false },
              { title: "Journal: one thing you're grateful for", done: false },
            ],
          }
        : item
    );
  }

  if (/\b(shorten|shorter|less time|quick)\b/.test(lower)) {
    revised = revised.map(item => ({
      ...item,
      estimateMinutes: item.estimateMinutes ? Math.max(15, item.estimateMinutes - 15) : 20,
      checklist: item.checklist?.slice(0, Math.max(2, Math.ceil((item.checklist.length + 1) / 2))),
    }));
  }

  if (/\b(remove|drop|skip)\b.*\b(day|week)\b/.test(lower)) {
    revised = revised.slice(0, Math.max(1, revised.length - 1));
  }

  return revised;
}

function buildLocalDayChecklist(dayIndex: number, includesMeals: boolean) {
  const isRestDay = dayIndex > 0 && (dayIndex + 1) % 7 === 0;
  if (isRestDay) {
    const items = ['20 min easy walk', 'Full-body stretching (10 min)'];
    if (includesMeals) {
      items.push('Breakfast: Greek yogurt + berries', 'Lunch: Grilled chicken salad', 'Dinner: Baked salmon + vegetables');
    }
    return items.map(title => ({ title, done: false }));
  }

  const focus = ['Lower body strength', 'Upper body push', 'Cardio intervals', 'Upper body pull', 'Full-body circuit', 'Core + conditioning'][dayIndex % 6];
  const items = [
    'Warm-up: 5 min walk + mobility',
    `${focus}: 3 sets × 12 reps`,
    'Finisher: 10 min brisk walk or bike',
    'Cool-down: 5 min stretch',
  ];
  if (includesMeals) {
    items.push('Breakfast: Oatmeal + protein', 'Lunch: Turkey wrap + side salad', 'Dinner: Lean protein bowl', 'Drink 2L water');
  }
  return items.map(title => ({ title, done: false }));
}

function nextWeekday(date: Date): Date {
  const next = new Date(date);
  while (next.getDay() === 0 || next.getDay() === 6) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function buildLocalOverview(schedule: CoachScheduleAssignment[], question: string): string {
  if (schedule.length === 0) return '';

  const days = schedule.length;
  if (/\b(mental health|wellness|mindfulness|well-being|wellbeing)\b/i.test(question)) {
    return `This ${days}-day mental health plan balances mindfulness, gentle movement, and reflective habits. Each day builds on the last with small, achievable steps so you can support your well-being without overwhelming your calendar.\n\nReview the daily tasks below, tap Overview for this summary, and ask me to adjust anything before you apply the plan.`;
  }

  if (/\b(workout|training|exercise|habit|routine)\b/i.test(question)) {
    return `This ${days}-day plan mixes training sessions, active recovery, and optional nutrition checkpoints. Workouts progress through different muscle groups while keeping daily time blocks realistic.\n\nUse each day's checklist to track warm-ups, main work, and meals. Tell me if you want it lighter or shorter before applying.`;
  }

  return `This plan spreads ${days} calendar task${days === 1 ? '' : 's'} across upcoming days. Each entry includes a due date and checklist steps so you know exactly what to do when.\n\nAsk me to lighten specific days, swap tasks, or change the focus before you tap Apply to calendar.`;
}

export function buildPlanSummaryTag(schedule: CoachScheduleAssignment[], question: string): string {
  if (/\b(mental health|wellness|mindfulness|well-being|wellbeing)\b/i.test(question)) {
    return `${schedule.length}-day mental health plan to support your well-being.`;
  }
  if (/\b(workout|training|exercise|habit|routine)\b/i.test(question)) {
    return `${schedule.length}-day workout plan with daily checklists.`;
  }
  return `I created a ${schedule.length}-day plan with new calendar tasks. Review below and apply to your calendar.`;
}

export function formatScheduleDue(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function buildCoachSuggestions(snapshot: CoachTaskSnapshot): CoachSuggestion[] {
  const suggestions: CoachSuggestion[] = [];

  if (snapshot.overdueCount > 0) {
    suggestions.push({
      id: 'overdue',
      kind: 'focus',
      title: `${snapshot.overdueCount} overdue task${snapshot.overdueCount === 1 ? '' : 's'}`,
      body: snapshot.topOverdueTitles.length
        ? `Start with "${snapshot.topOverdueTitles[0]}" or roll everything forward to today — no guilt, just a nudge.`
        : 'Roll overdue tasks to today or reschedule them on the calendar.',
      actionLabel: 'Roll overdue to today',
      actionType: 'roll-overdue',
    });
  }

  if (snapshot.isOvercommitted) {
    suggestions.push({
      id: 'overcommitted',
      kind: 'capacity',
      title: 'Today looks overcommitted',
      body: `You've planned ${snapshot.todayEstimatedLabel} against a ${snapshot.dayCapacityLabel} day. Move lower-priority work to tomorrow or shrink estimates.`,
      actionLabel: 'Lighten today',
      actionType: 'lighten-today',
    });
  }

  if (snapshot.unscheduledCount > 0) {
    suggestions.push({
      id: 'unscheduled',
      kind: 'schedule',
      title: `${snapshot.unscheduledCount} task${snapshot.unscheduledCount === 1 ? '' : 's'} without a date`,
      body: snapshot.topUnscheduledTitles.length
        ? `"${snapshot.topUnscheduledTitles[0]}"${snapshot.unscheduledCount > 1 ? ' and others' : ''} could use a day on the calendar.`
        : 'Drag tasks onto a day in Calendar to build a realistic week.',
      actionLabel: 'Open calendar',
      actionType: 'open-calendar',
    });
  }

  if (snapshot.dueTodayCount > 0 && snapshot.highPriorityOpenCount === 0) {
    suggestions.push({
      id: 'priorities',
      kind: 'insight',
      title: 'Nothing flagged high priority today',
      body: `You have ${snapshot.dueTodayCount} task${snapshot.dueTodayCount === 1 ? '' : 's'} due today. Mark your must-do with the priority flag so the coach knows what matters most.`,
    });
  }

  if (snapshot.dueTodayCount === 0 && snapshot.overdueCount === 0 && snapshot.upcomingCount > 0) {
    suggestions.push({
      id: 'clear-today',
      kind: 'insight',
      title: 'Clear runway today',
      body: `${snapshot.upcomingCount} upcoming task${snapshot.upcomingCount === 1 ? ' is' : 's are'} on the horizon. Good day to prep or knock out unscheduled work.`,
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 'empty',
      kind: 'insight',
      title: 'Ready when you are',
      body: 'Try quick-add like "Ship report Friday 1h !!" or ask the coach what to focus on.',
    });
  }

  return suggestions.slice(0, 4);
}

export function answerCoachQuestion(question: string, snapshot: CoachTaskSnapshot, history: CoachChatTurn[] = []): CoachChatReply {
  const q = question.trim().toLowerCase();
  if (!q) {
    return {
      text: 'Ask me what to focus on, whether you\'re overcommitted, or what to schedule next.',
      suggestions: buildCoachSuggestions(snapshot),
    };
  }

  if (isVagueCoachInput(question)) {
    return {
      text: buildClarifyingReply(question),
      suggestions: buildCoachSuggestions(snapshot),
    };
  }

  if (/overdue|late|behind/.test(q)) {
    return {
      text: snapshot.overdueCount
        ? `You have ${snapshot.overdueCount} overdue. I'd tackle "${snapshot.topOverdueTitles[0] ?? 'the oldest one'}" first, or roll them to today if the list is stale.`
        : 'Nothing overdue — nice work staying current.',
      suggestions: buildCoachSuggestions(snapshot),
    };
  }

  if (/today|focus|now|start/.test(q)) {
    if (snapshot.dueTodayCount > 0) {
      return {
        text: `${snapshot.dueTodayCount} due today${snapshot.isOvercommitted ? `, but the day is over ${snapshot.dayCapacityLabel}` : ''}. Protect time for high-priority items before adding more.`,
        suggestions: buildCoachSuggestions(snapshot),
      };
    }
    return {
      text: snapshot.unscheduledCount
        ? `Nothing due today. You have ${snapshot.unscheduledCount} unscheduled — pick one and give it a date.`
        : 'Nothing due today. Good moment for deep work or clearing small tasks.',
      suggestions: buildCoachSuggestions(snapshot),
    };
  }

  if (/schedule|calendar|when|tomorrow|week/.test(q)) {
    return {
      text: snapshot.unscheduledCount
        ? `${snapshot.unscheduledCount} tasks need a day. Open Calendar and drag "${snapshot.topUnscheduledTitles[0] ?? 'one'}" onto the best slot.`
        : 'Your active tasks are scheduled. Scan upcoming days for gaps before adding more.',
      suggestions: buildCoachSuggestions(snapshot),
    };
  }

  if (/overcommit|too much|capacity|hours|realistic/.test(q)) {
    return {
      text: snapshot.isOvercommitted
        ? `Yes — ${snapshot.todayEstimatedLabel} planned vs ${snapshot.dayCapacityLabel} capacity. Move something out or shrink estimates.`
        : `You're within capacity (${snapshot.todayEstimatedLabel} / ${snapshot.dayCapacityLabel}). Room to add one more focused block.`,
      suggestions: buildCoachSuggestions(snapshot),
    };
  }

  if (/priority|important|urgent/.test(q)) {
    return {
      text: snapshot.highPriorityOpenCount
        ? `${snapshot.highPriorityOpenCount} open high-priority task${snapshot.highPriorityOpenCount === 1 ? '' : 's'}. Do those before medium/low work.`
        : 'No high-priority flags yet. Tap the flag on a task to tell me what must ship.',
      suggestions: buildCoachSuggestions(snapshot),
    };
  }

  return {
    text: 'Try asking about today, overdue items, scheduling, or whether you\'re overcommitted.',
    suggestions: buildCoachSuggestions(snapshot),
  };
}
