import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskTimePicker } from './task-time-picker';

describe('TaskTimePicker', () => {
  let fixture: ComponentFixture<TaskTimePicker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskTimePicker],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskTimePicker);
    fixture.componentRef.setInput('value', '08:02');
    fixture.detectChanges();
  });

  it('formats 24h values for display', () => {
    expect(fixture.nativeElement.textContent).toContain('08:02 AM');
  });
});
