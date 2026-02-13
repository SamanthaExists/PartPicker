import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header mb-4">
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <h1 class="page-title mb-1">{{ title }}</h1>
          <p class="page-subtitle mb-0" *ngIf="subtitle">{{ subtitle }}</p>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <ng-content select="[actions]"></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-title {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      margin: 0;
    }
    .page-subtitle {
      font-size: 0.875rem;
      color: var(--text-muted);
    }
  `]
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
}
