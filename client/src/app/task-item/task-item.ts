import { Component, input, output, signal } from '@angular/core';
import { Task } from '../task-store';

@Component({
  selector: 'app-task-item',
templateUrl: './task-item.html',
  styleUrl: './task-item.css',
})
export class TaskItem {
  task = input.required<Task>();
  position = input<number>();
  toggle = output<number>();
  remove = output<number>();
  edit = output<{ id: number; title: string }>();

  isEditing = signal(false);

  onToggle() { this.toggle.emit(this.task().id); }
  onRemove() { this.remove.emit(this.task().id); }

  startEditing() { this.isEditing.set(true); }
  cancelEditing() { this.isEditing.set(false); }

  saveEdit(newTitle: string) {
    this.edit.emit({ id: this.task().id, title: newTitle });
    this.isEditing.set(false);
  }
}