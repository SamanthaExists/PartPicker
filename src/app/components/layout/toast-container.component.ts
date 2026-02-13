import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div
        *ngFor="let toast of toasts"
        class="toast-item"
        [class.toast-success]="toast.type === 'success'"
        [class.toast-error]="toast.type === 'error'"
        [class.toast-warning]="toast.type === 'warning'"
        [class.toast-info]="toast.type === 'info'"
        [attr.data-toast-id]="toast.id"
        (click)="dismiss(toast.id)">
        <div class="toast-icon">
          <i class="bi"
             [ngClass]="{
               'bi-check-circle-fill': toast.type === 'success',
               'bi-exclamation-circle-fill': toast.type === 'error',
               'bi-exclamation-triangle-fill': toast.type === 'warning',
               'bi-info-circle-fill': toast.type === 'info'
             }">
          </i>
        </div>
        <div class="toast-message">{{ toast.message }}</div>
        <button class="toast-close" (click)="dismiss(toast.id); $event.stopPropagation()" aria-label="Close">
          <i class="bi bi-x"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-width: 400px;
      pointer-events: none;
    }

    @media (max-width: 576px) {
      .toast-container {
        left: 1rem;
        right: 1rem;
        max-width: none;
      }
    }

    .toast-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem 1rem;
      border-radius: var(--radius-lg);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1);
      background-color: var(--surface-card);
      border: 1px solid var(--surface-border);
      pointer-events: auto;
      cursor: pointer;
      animation: toast-slide-in 0.3s ease-out;
      transition: all 0.2s ease;
      min-height: 60px;
    }

    .toast-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2), 0 3px 6px rgba(0, 0, 0, 0.15);
    }

    @keyframes toast-slide-in {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    .toast-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .toast-success {
      border-left: 4px solid var(--color-success);
    }

    .toast-success .toast-icon {
      color: var(--color-success);
    }

    .toast-error {
      border-left: 4px solid var(--color-danger);
    }

    .toast-error .toast-icon {
      color: var(--color-danger);
    }

    .toast-warning {
      border-left: 4px solid var(--color-warning);
    }

    .toast-warning .toast-icon {
      color: var(--color-warning);
    }

    .toast-info {
      border-left: 4px solid var(--color-info);
    }

    .toast-info .toast-icon {
      color: var(--color-info);
    }

    .toast-message {
      flex-grow: 1;
      font-size: var(--text-sm);
      color: var(--text-primary);
      line-height: 1.4;
    }

    .toast-close {
      background: transparent;
      border: none;
      padding: 0.25rem;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      transition: all var(--transition-fast);
      flex-shrink: 0;
    }

    .toast-close:hover {
      background-color: var(--surface-inset);
      color: var(--text-primary);
    }

    .toast-close i {
      font-size: 1.125rem;
    }
  `]
})
export class ToastContainerComponent implements OnInit {
  toasts: Toast[] = [];

  constructor(private toastService: ToastService) {}

  ngOnInit(): void {
    this.toastService.toasts$.subscribe(toasts => {
      this.toasts = toasts;
    });
  }

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }
}
