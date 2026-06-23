import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Task {
  id: number;
  title: string;
  done: boolean;
}

const API_URL = 'http://localhost:5226/api/tasks';

@Injectable({ providedIn: 'root' })
export class TaskStore {
  private http = inject(HttpClient);

  tasks = signal<Task[]>([]);

  remaining = computed(() => this.tasks().filter(task => !task.done).length);
  completedTasks = computed(() => this.tasks().filter(task => task.done));
  activeTasks = computed(() => this.tasks().filter(task => !task.done));

  constructor() {
    this.loadTasks();
  }

  loadTasks() {
    this.http.get<Task[]>(API_URL).subscribe(tasks => this.tasks.set(tasks));
  }

  addTask(title: string) {
    if (title.trim() === '') return;
    this.http.post<Task>(API_URL, { title }).subscribe(() => this.loadTasks());
  }

  toggleTask(id: number) {
    const task = this.tasks().find(t => t.id === id);
    if (!task) return;
    this.http.put<Task>(`${API_URL}/${id}`, { title: task.title, done: !task.done })
      .subscribe(() => this.loadTasks());
  }

  editTask(id: number, newTitle: string) {
    const task = this.tasks().find(t => t.id === id);
    if (!task || newTitle.trim() === '') return;
    this.http.put<Task>(`${API_URL}/${id}`, { title: newTitle, done: task.done })
      .subscribe(() => this.loadTasks());
  }

  removeTask(id: number) {
    this.http.delete(`${API_URL}/${id}`).subscribe(() => this.loadTasks());
  }

  clearTasks() {
    this.http.delete(API_URL).subscribe(() => this.loadTasks());
  }
}