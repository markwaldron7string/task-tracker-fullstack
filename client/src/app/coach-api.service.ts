import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';
import { coachChatApiUrl, defaultTasksApiUrl } from './api-url';
import { CoachScheduleAssignment, CoachTaskSnapshot, CoachChatTurn } from './pro-coach';

interface AppConfig {
  tasksApiUrl?: string;
}

interface CoachChatApiResponse {
  text: string;
  source?: 'ai' | 'local';
  schedule?: CoachScheduleAssignment[];
}

export interface CoachApiReply {
  text: string;
  source: 'ai' | 'local';
  schedule: CoachScheduleAssignment[];
}

@Injectable({ providedIn: 'root' })
export class CoachApiService {
  private http = inject(HttpClient);
  private coachApiUrl = coachChatApiUrl(defaultTasksApiUrl());
  private configLoaded = false;

  async chat(
    question: string,
    snapshot: CoachTaskSnapshot,
    history: CoachChatTurn[] = []
  ): Promise<CoachApiReply | null> {
    await this.ensureConfigLoaded();

    try {
      const response = await firstValueFrom(
        this.http
          .post<CoachChatApiResponse>(this.coachApiUrl, { question, snapshot, history })
          .pipe(timeout(45_000), catchError(() => of(null)))
      );

      if (!response?.text) return null;

      return {
        text: response.text,
        source: response.source === 'ai' ? 'ai' : 'local',
        schedule: response.schedule ?? [],
      };
    } catch {
      return null;
    }
  }

  private async ensureConfigLoaded(): Promise<void> {
    if (this.configLoaded) return;

    try {
      const config = await firstValueFrom(
        this.http.get<AppConfig>('/app-config.json').pipe(catchError(() => of<AppConfig>({})))
      );
      this.coachApiUrl = coachChatApiUrl(config.tasksApiUrl);
    } catch {
      this.coachApiUrl = coachChatApiUrl(defaultTasksApiUrl());
    } finally {
      this.configLoaded = true;
    }
  }
}
