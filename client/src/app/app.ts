import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';
import { ThemePicker } from './theme-picker/theme-picker';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemePicker],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  appName = 'Task Tracker';
  protected _theme = inject(ThemeService);
}
