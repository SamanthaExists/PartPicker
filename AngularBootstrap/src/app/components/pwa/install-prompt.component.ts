import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-install-prompt',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="showPrompt" class="install-prompt alert alert-primary alert-dismissible fade show d-flex align-items-center" role="alert">
      <i class="bi bi-download fs-4 me-3"></i>
      <div class="flex-grow-1">
        <strong>Install Pick List Tracker</strong>
        <p class="mb-0 small">Install this app on your device for quick access and offline use.</p>
      </div>
      <button class="btn btn-primary btn-sm me-2" (click)="installApp()">
        Install
      </button>
      <button type="button" class="btn-close" (click)="dismissPrompt()"></button>
    </div>
  `,
  styles: [`
    .install-prompt {
      position: fixed;
      bottom: 20px;
      left: 20px;
      right: 20px;
      max-width: 500px;
      margin: 0 auto;
      z-index: 1050;
      box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
    }

    @media (max-width: 576px) {
      .install-prompt {
        bottom: 10px;
        left: 10px;
        right: 10px;
      }
    }
  `]
})
export class InstallPromptComponent implements OnInit, OnDestroy {
  showPrompt = false;
  private deferredPrompt: any = null;

  ngOnInit(): void {
    // Check if already dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      // Show again after 7 days
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      return;
    }

    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
  }

  ngOnDestroy(): void {
    window.removeEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt);
  }

  private handleBeforeInstallPrompt = (e: Event): void => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    this.deferredPrompt = e;
    // Show the install prompt
    this.showPrompt = true;
  };

  async installApp(): Promise<void> {
    if (!this.deferredPrompt) return;

    // Show the install prompt
    this.deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await this.deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    // Clear the deferredPrompt
    this.deferredPrompt = null;
    this.showPrompt = false;
  }

  dismissPrompt(): void {
    this.showPrompt = false;
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
  }
}
