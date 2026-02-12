import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-update-prompt',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="showPrompt" class="update-prompt alert alert-warning alert-dismissible fade show d-flex align-items-center" role="alert">
      <i class="bi bi-arrow-repeat fs-4 me-3"></i>
      <div class="flex-grow-1">
        <strong>Update Available</strong>
        <p class="mb-0 small">A new version of Pick List Tracker is available.</p>
      </div>
      <button class="btn btn-warning btn-sm me-2" (click)="updateApp()">
        Update Now
      </button>
      <button type="button" class="btn-close" (click)="dismissPrompt()"></button>
    </div>
  `,
  styles: [`
    .update-prompt {
      position: fixed;
      top: 70px;
      left: 20px;
      right: 20px;
      max-width: 500px;
      margin: 0 auto;
      z-index: 1050;
      box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    }

    @media (max-width: 576px) {
      .update-prompt {
        top: 66px;
        left: 10px;
        right: 10px;
      }
    }
  `]
})
export class UpdatePromptComponent implements OnInit {
  showPrompt = false;

  ngOnInit(): void {
    // Listen for custom update event that could be dispatched from service worker registration
    window.addEventListener('swUpdate', () => {
      this.showPrompt = true;
    });
  }

  updateApp(): void {
    // Reload to get new version
    window.location.reload();
  }

  dismissPrompt(): void {
    this.showPrompt = false;
  }
}
