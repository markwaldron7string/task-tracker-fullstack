import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';

import { ProUpgrade } from './pro-upgrade';
import { ProService } from '../pro.service';

describe('ProUpgrade', () => {
  let fixture: ComponentFixture<ProUpgrade>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProUpgrade],
      providers: [
        provideRouter([]),
        { provide: ProService, useValue: { unlocked: signal(false), unlock: () => {} } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProUpgrade);
    fixture.componentRef.setInput('feature', 'calendar');
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });
});
