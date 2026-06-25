import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Completed } from './completed';
import { TaskStore } from '../task-store';

const taskStoreStub = {
  completedEnrichedTasks: () => [],
  toggleTask: () => {},
  removeTask: () => {},
  editTask: () => {},
  cyclePriority: () => {},
  setDue: () => {},
  cycleEstimate: () => {},
};

describe('Completed', () => {
  let component: Completed;
  let fixture: ComponentFixture<Completed>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Completed],
      providers: [
        { provide: TaskStore, useValue: taskStoreStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Completed);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
