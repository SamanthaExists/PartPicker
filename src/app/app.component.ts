import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, RouterOutlet } from '@angular/router';
import { SettingsService } from './services/settings.service';
import { GlobalSearchComponent } from './components/layout/global-search.component';
import { InstallPromptComponent } from './components/pwa/install-prompt.component';
import { UpdatePromptComponent } from './components/pwa/update-prompt.component';
import { OfflineIndicatorComponent } from './components/pwa/offline-indicator.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterOutlet,
    GlobalSearchComponent,
    InstallPromptComponent,
    UpdatePromptComponent,
    OfflineIndicatorComponent
  ],
  template: `
    <div class="d-flex min-vh-100">
      <!-- Sidebar -->
      <aside class="sidebar d-none d-lg-flex flex-column" style="width: 260px;">
        <div class="d-flex align-items-center p-3 border-bottom">
          <i class="bi bi-clipboard-check text-primary fs-4 me-2"></i>
          <span class="fw-bold">Pick List Tracker</span>
        </div>

        <nav class="flex-grow-1 p-3">
          <ul class="nav flex-column">
            <li class="nav-item" *ngFor="let item of navItems">
              <a class="nav-link d-flex align-items-center"
                 [routerLink]="item.path"
                 routerLinkActive="active"
                 [routerLinkActiveOptions]="{exact: item.path === '/'}">
                <i class="bi" [ngClass]="item.icon"></i>
                {{ item.label }}
              </a>
            </li>
          </ul>
        </nav>

        <div class="p-3 border-top">
          <div class="d-flex align-items-center small">
            <span class="online-indicator me-2" [class.online]="isOnline" [class.offline]="!isOnline"></span>
            <span class="text-muted">{{ isOnline ? 'Online' : 'Offline' }}</span>
          </div>
        </div>
      </aside>

      <!-- Mobile Header -->
      <div class="d-lg-none position-fixed top-0 start-0 end-0 bg-body border-bottom z-3" style="height: 56px;">
        <div class="d-flex align-items-center h-100 px-3">
          <button class="btn btn-link text-body p-0 me-3" (click)="toggleSidebar()">
            <i class="bi bi-list fs-4"></i>
          </button>
          <span class="fw-bold">Tool Pick List</span>
          <div class="ms-auto d-flex align-items-center gap-2">
            <app-global-search></app-global-search>
            <span class="online-indicator" [class.online]="isOnline" [class.offline]="!isOnline"></span>
          </div>
        </div>
      </div>

      <!-- Mobile Sidebar Backdrop -->
      <div class="sidebar-backdrop d-lg-none"
           *ngIf="sidebarOpen"
           (click)="toggleSidebar()">
      </div>

      <!-- Mobile Sidebar -->
      <aside class="sidebar d-lg-none flex-column"
             [class.show]="sidebarOpen">
        <div class="d-flex align-items-center justify-content-between p-3 border-bottom">
          <div class="d-flex align-items-center">
            <i class="bi bi-clipboard-check text-primary fs-4 me-2"></i>
            <span class="fw-bold">Pick List Tracker</span>
          </div>
          <button class="btn btn-link text-body p-0" (click)="toggleSidebar()">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <nav class="flex-grow-1 p-3">
          <ul class="nav flex-column">
            <li class="nav-item" *ngFor="let item of navItems">
              <a class="nav-link d-flex align-items-center"
                 [routerLink]="item.path"
                 routerLinkActive="active"
                 [routerLinkActiveOptions]="{exact: item.path === '/'}"
                 (click)="toggleSidebar()">
                <i class="bi" [ngClass]="item.icon"></i>
                {{ item.label }}
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      <!-- Main Content -->
      <main class="flex-grow-1 d-flex flex-column overflow-hidden">
        <!-- Desktop Header -->
        <header class="d-none d-lg-flex align-items-center justify-content-between p-3 border-bottom bg-body" style="height: 56px;">
          <app-global-search></app-global-search>
          <div class="d-flex align-items-center">
            <span class="online-indicator me-2" [class.online]="isOnline" [class.offline]="!isOnline"></span>
            <span class="text-muted small">{{ isOnline ? 'Online' : 'Offline' }}</span>
          </div>
        </header>

        <!-- Page Content -->
        <div class="flex-grow-1 overflow-auto" style="padding-top: 56px;" [class.pt-lg-0]="true">
          <div class="container-fluid p-4">
            <router-outlet></router-outlet>
          </div>
        </div>
      </main>
    </div>

    <!-- PWA Components -->
    <app-offline-indicator></app-offline-indicator>
    <app-install-prompt></app-install-prompt>
    <app-update-prompt></app-update-prompt>
  `,
  styles: [`
    :host {
      display: block;
    }

    .pt-lg-0 {
      padding-top: 0 !important;
    }

    @media (min-width: 992px) {
      main > div:last-child {
        padding-top: 0 !important;
      }
    }
  `]
})
export class AppComponent implements OnInit {
  sidebarOpen = false;
  isOnline = navigator.onLine;

  navItems = [
    { path: '/', label: 'Dashboard', icon: 'bi-speedometer2' },
    { path: '/orders', label: 'Orders', icon: 'bi-clipboard-data' },
    { path: '/parts', label: 'Parts', icon: 'bi-box-seam' },
    { path: '/items-to-order', label: 'Items to Order', icon: 'bi-cart' },
    { path: '/issues', label: 'Issues', icon: 'bi-exclamation-triangle' },
    { path: '/activity', label: 'Activity History', icon: 'bi-clock-history' },
    { path: '/templates', label: 'Templates', icon: 'bi-file-earmark-text' },
    { path: '/import', label: 'Import', icon: 'bi-upload' },
    { path: '/settings', label: 'Settings', icon: 'bi-gear' },
  ];

  constructor(private settingsService: SettingsService) {}

  ngOnInit(): void {
    this.settingsService.initializeTheme();

    window.addEventListener('online', () => this.isOnline = true);
    window.addEventListener('offline', () => this.isOnline = false);
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }
}
