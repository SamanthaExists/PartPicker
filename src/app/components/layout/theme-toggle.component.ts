import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="btn btn-sm d-flex align-items-center gap-2"
      [class]="buttonClass"
      [title]="'Theme: ' + currentTheme + ' (click to cycle)'"
      [attr.aria-label]="'Current theme: ' + currentTheme + '. Click to change.'"
      (click)="cycleTheme()">
      <i class="bi" [ngClass]="themeIcon"></i>
      <span class="d-none d-sm-inline text-capitalize">{{ currentTheme }}</span>
    </button>
  `,
  styles: [`
    :host {
      display: contents;
    }
  `]
})
export class ThemeToggleComponent implements OnInit {
  @Input() buttonClass = 'btn-outline-secondary';
  currentTheme: 'light' | 'dark' | 'system' = 'system';

  constructor(private settingsService: SettingsService) {}

  ngOnInit(): void {
    this.currentTheme = this.settingsService.getTheme();

    // Subscribe to theme changes
    this.settingsService.settings$.subscribe(settings => {
      this.currentTheme = settings.theme;
    });
  }

  get themeIcon(): string {
    switch (this.currentTheme) {
      case 'light':
        return 'bi-sun-fill';
      case 'dark':
        return 'bi-moon-fill';
      case 'system':
        return 'bi-display';
      default:
        return 'bi-display';
    }
  }

  cycleTheme(): void {
    let nextTheme: 'light' | 'dark' | 'system';

    if (this.currentTheme === 'light') {
      nextTheme = 'dark';
    } else if (this.currentTheme === 'dark') {
      nextTheme = 'system';
    } else {
      nextTheme = 'light';
    }

    this.settingsService.setTheme(nextTheme);
  }
}
