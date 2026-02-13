import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-install-prompt',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="showPrompt" class="install-prompt">
      <div class="install-content">
        <div class="install-info">
          <i class="bi bi-download install-icon"></i>
          <div>
            <div class="install-title">Install Pick List Tracker</div>
            <div class="install-desc">Add to home screen for quick access &amp; offline use</div>
          </div>
        </div>
        <div class="install-actions">
          <button class="btn btn-sm btn-outline-light" (click)="dismissPrompt()">Later</button>
          <button class="btn btn-sm btn-light fw-semibold" (click)="installApp()">
            <i class="bi bi-plus-circle me-1"></i>Install
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .install-prompt{position:fixed;bottom:0;left:0;right:0;z-index:1050;padding:12px 16px;background:linear-gradient(135deg,var(--primary-color,#0f766e),#115e59);box-shadow:0 -4px 16px rgba(0,0,0,.3);animation:slideUp .3s ease}
    .install-content{max-width:600px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .install-info{display:flex;align-items:center;gap:12px}
    .install-icon{font-size:1.5rem;color:#5eead4}
    .install-title{color:#fff;font-weight:600;font-size:.95rem}
    .install-desc{color:rgba(255,255,255,.7);font-size:.8rem}
    .install-actions{display:flex;gap:8px;flex-shrink:0}
    @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
    @media(max-width:576px){.install-content{justify-content:center;text-align:center}.install-info{flex-direction:column;text-align:center}}
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
