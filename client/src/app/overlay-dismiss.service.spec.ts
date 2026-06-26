import { TestBed } from '@angular/core/testing';
import { OverlayDismissService } from './overlay-dismiss.service';

describe('OverlayDismissService', () => {
  let service: OverlayDismissService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OverlayDismissService);
  });

  it('closes the topmost overlay on outside mousedown', () => {
    const closed: string[] = [];
    service.register({
      contains: () => false,
      close: () => closed.push('dialog'),
    });

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(closed).toEqual(['dialog']);
  });

  it('does not close when the click is inside the overlay', () => {
    const closed: string[] = [];
    const inside = document.createElement('div');
    document.body.appendChild(inside);

    service.register({
      contains: target => inside.contains(target),
      close: () => closed.push('dialog'),
    });

    inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(closed).toEqual([]);

    document.body.removeChild(inside);
  });
});
