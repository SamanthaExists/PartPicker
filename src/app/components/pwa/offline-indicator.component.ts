import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { OfflineService } from '../../services/offline.service';

@Component({
  selector: 'app-offline-indicator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Offline Banner -->
    <div *ngIf="!isOnline" class="offline-banner alert alert-warning mb-0 rounded-0 d-flex align-items-center justify-content-center py-2">
      <i class="bi bi-wifi-off me-2"></i>
      <span>You're offline. Changes will sync when you reconnect.</span>
      <span *ngIf="pendingCount > 0" class="badge bg-dark ms-2">
        {{ pendingCount }} pending
      </span>
    </div>

    <!-- Syncing Banner -->
    <div *ngIf="isSyncing" class="syncing-banner alert alert-info mb-0 rounded-0 d-flex align-items-center justify-content-center py-2">
      <div class="spinner-border spinner-border-sm me-2"></div>
      <span>Syncing {{ pendingCount }} pending picks...</span>
    </div>

    <!-- Sync Complete Toast -->
    <div *ngIf="showSyncComplete" class="sync-toast position-fixed" style="bottom: 20px; right: 20px; z-index: 1050;">
      <div class="toast show" role="alert">
        <div class="toast-header bg-success text-white">
          <i class="bi bi-check-circle me-2"></i>
          <strong class="me-auto">Sync Complete</strong>
          <button type="button" class="btn-close btn-close-white" (click)="showSyncComplete = false"></button>
        </div>
        <div class="toast-body">
          All pending picks have been synced.
        </div>
      </div>
    </div>
  `,
  styles: [`
    .offline-banner, .syncing-banner {
      position: fixed;
      top: 56px;
      left: 0;
      right: 0;
      z-index: 1040;
    }

    @media (min-width: 992px) {
      .offline-banner, .syncing-banner {
        left: 260px;
      }
    }
  `]
})
export class OfflineIndicatorComponent implements OnInit, OnDestroy {
  isOnline = true;
  isSyncing = false;
  showSyncComplete = false;
  pendingCount = 0;

  private subscriptions: Subscription[] = [];

  constructor(private offlineService: OfflineService) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.offlineService.isOnline$.subscribe(online => {
        const wasOffline = !this.isOnline;
        this.isOnline = online;

        // If we just came back online and have pending picks, they would sync automatically
        if (online && wasOffline && this.pendingCount > 0) {
          this.isSyncing = true;
          // Simulate sync delay
          setTimeout(() => {
            this.isSyncing = false;
            this.showSyncComplete = true;
            this.pendingCount = 0;
            setTimeout(() => this.showSyncComplete = false, 3000);
          }, 1500);
        }
      })
    );

    // Track pending picks count from localStorage
    this.updatePendingCount();
    window.addEventListener('storage', () => this.updatePendingCount());
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private updatePendingCount(): void {
    const stored = localStorage.getItem('offline-picks-queue');
    if (stored) {
      try {
        const picks = JSON.parse(stored);
        this.pendingCount = Array.isArray(picks) ? picks.length : 0;
      } catch {
        this.pendingCount = 0;
      }
    } else {
      this.pendingCount = 0;
    }
  }
}
