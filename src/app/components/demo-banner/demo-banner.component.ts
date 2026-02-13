import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DemoModeService } from '../../services/demo-mode.service';

@Component({
  selector: 'app-demo-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="demo-banner alert alert-info alert-dismissible fade show mb-0" role="alert" *ngIf="showBanner">
      <div class="container-fluid d-flex align-items-center justify-content-between">
        <div class="d-flex align-items-center">
          <i class="bi bi-info-circle me-2"></i>
          <strong>🎭 Demo Mode</strong>
          <span class="ms-2">— showing sample warehouse data</span>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button type="button" class="btn btn-sm btn-outline-info" (click)="exitDemoMode()">
            Exit Demo Mode
          </button>
          <button type="button" class="btn-close" (click)="dismissBanner()" aria-label="Close"></button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .demo-banner {
      position: sticky;
      top: 0;
      z-index: 1030;
      border-radius: 0;
      border-left: 0;
      border-right: 0;
      border-top: 0;
      margin-bottom: 0 !important;
    }

    @media (max-width: 768px) {
      .demo-banner .d-flex {
        flex-direction: column;
        align-items: flex-start !important;
        gap: 0.5rem;
      }
      
      .demo-banner .gap-2 {
        width: 100%;
        justify-content: space-between;
      }
    }
  `]
})
export class DemoBannerComponent implements OnInit {
  showBanner = false;
  private readonly BANNER_DISMISSED_KEY = 'demo_banner_dismissed';

  constructor(private demoModeService: DemoModeService) {}

  ngOnInit(): void {
    this.demoModeService.demoMode$.subscribe(isDemoMode => {
      if (isDemoMode && !sessionStorage.getItem(this.BANNER_DISMISSED_KEY)) {
        this.showBanner = true;
      } else {
        this.showBanner = false;
      }
    });
  }

  dismissBanner(): void {
    sessionStorage.setItem(this.BANNER_DISMISSED_KEY, 'true');
    this.showBanner = false;
  }

  exitDemoMode(): void {
    this.demoModeService.disableDemoMode();
  }
}
