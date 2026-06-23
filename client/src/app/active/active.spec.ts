import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Active } from './active';
import { TaskStore } from '../task-store';

const taskStoreStub = {
  activeTasks: () => []
};

describe('Active', () => {
  let component: Active;
  let fixture: ComponentFixture<Active>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Active],
      providers: [
        { provide: TaskStore, useValue: taskStoreStub }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Active);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
