import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TaskList } from './task-list';
import { TaskStore } from '../task-store';

const taskStoreStub = {
  tasks: () => [],
  remaining: () => 0,
  pendingChanges: () => 0,
  syncStatus: () => 'synced',
  syncMessage: () => 'Synced',
  addTask: () => {},
  toggleTask: () => {},
  editTask: () => {},
  removeTask: () => {},
  clearTasks: () => {}
};

describe('TaskList', () => {
  let component: TaskList;
  let fixture: ComponentFixture<TaskList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskList],
      providers: [
        { provide: TaskStore, useValue: taskStoreStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TaskList);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
