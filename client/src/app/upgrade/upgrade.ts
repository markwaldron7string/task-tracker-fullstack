import { Component } from '@angular/core';
import { ProUpgrade } from '../pro-upgrade/pro-upgrade';

@Component({
  selector: 'app-upgrade',
  imports: [ProUpgrade],
  template: '<app-pro-upgrade variant="page" [showLearnMore]="false" />',
})
export class Upgrade {}
