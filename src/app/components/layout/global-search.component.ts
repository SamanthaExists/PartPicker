import { Component, OnInit, OnDestroy, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { GlobalSearchService, SearchResult } from '../../services/global-search.service';

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="global-search position-relative">
      <!-- Desktop Search -->
      <div class="d-none d-md-block">
        <div class="input-group">
          <span class="input-group-text bg-transparent border-end-0">
            <i class="bi bi-search text-muted"></i>
          </span>
          <input
            type="text"
            class="form-control border-start-0 ps-0"
            placeholder="Search parts, orders..."
            [(ngModel)]="searchQuery"
            (input)="onSearchInput()"
            (focus)="showResults = true"
            (keydown)="onKeydown($event)"
          >
          <span class="input-group-text bg-transparent border-start-0 text-muted small" *ngIf="!searchQuery">
            <kbd class="bg-body-secondary border rounded px-1">Ctrl+K</kbd>
          </span>
        </div>

        <!-- Results Dropdown -->
        <div
          *ngIf="showResults && searchQuery.length >= 2"
          class="position-absolute top-100 start-0 end-0 bg-body border rounded-bottom shadow-sm mt-1 z-3"
          style="max-height: 400px; overflow-y: auto;"
        >
          <div *ngIf="loading" class="text-center py-3 text-muted">
            <div class="spinner-border spinner-border-sm me-2"></div>
            Searching...
          </div>

          <div *ngIf="!loading && results.length === 0" class="text-center py-3 text-muted">
            No results found
          </div>

          <div *ngIf="!loading && results.length > 0" class="list-group list-group-flush">
            <div
              *ngFor="let result of results; let i = index"
              class="list-group-item"
              [class.active]="i === selectedIndex"
              (mouseenter)="selectedIndex = i"
            >
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <span class="font-monospace fw-medium">{{ result.part_number }}</span>
                  <small class="text-muted ms-2" *ngIf="result.description">{{ result.description }}</small>
                </div>
                <span class="badge bg-body-secondary text-body">SO-{{ result.so_number }}</span>
              </div>
              <div class="small text-muted mt-1">
                <span *ngIf="result.location" class="me-3">
                  <i class="bi bi-geo-alt me-1"></i>{{ result.location }}
                </span>
                <span>
                  <i class="bi bi-box me-1"></i>{{ result.total_picked }}/{{ result.total_qty_needed }} picked
                </span>
              </div>
              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-sm btn-primary flex-grow-1 flex-sm-grow-0" (click)="goToOrder(result)">
                  Order
                </button>
                <button class="btn btn-sm btn-outline-secondary flex-grow-1 flex-sm-grow-0" (click)="viewInParts(result)">
                  Parts
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile Search Button -->
      <div class="d-md-none">
        <button class="btn btn-outline-secondary" (click)="toggleMobileSearch()">
          <i class="bi bi-search"></i>
        </button>
      </div>

      <!-- Mobile Search Overlay -->
      <div
        *ngIf="showMobileSearch"
        class="mobile-search-overlay position-fixed top-0 start-0 end-0 bottom-0 bg-body z-3 d-md-none"
      >
        <div class="p-3">
          <div class="d-flex gap-2 mb-3">
            <input
              type="text"
              class="form-control"
              placeholder="Search parts, orders..."
              [(ngModel)]="searchQuery"
              (input)="onSearchInput()"
              autofocus
            >
            <button class="btn btn-outline-secondary" (click)="closeMobileSearch()">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>

          <div *ngIf="loading" class="text-center py-3 text-muted">
            <div class="spinner-border spinner-border-sm me-2"></div>
            Searching...
          </div>

          <div *ngIf="!loading && searchQuery.length >= 2 && results.length === 0" class="text-center py-3 text-muted">
            No results found
          </div>

          <div *ngIf="!loading && results.length > 0" class="list-group">
            <div
              *ngFor="let result of results"
              class="list-group-item"
            >
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <span class="font-monospace fw-medium">{{ result.part_number }}</span>
                  <small class="text-muted d-block" *ngIf="result.description">{{ result.description }}</small>
                </div>
                <span class="badge bg-body-secondary text-body">SO-{{ result.so_number }}</span>
              </div>
              <div class="small text-muted mt-1">
                <span *ngIf="result.location" class="me-3">
                  <i class="bi bi-geo-alt me-1"></i>{{ result.location }}
                </span>
                <span>
                  <i class="bi bi-box me-1"></i>{{ result.total_picked }}/{{ result.total_qty_needed }}
                </span>
              </div>
              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-sm btn-primary flex-grow-1" (click)="goToOrder(result)">
                  Order
                </button>
                <button class="btn btn-sm btn-outline-secondary flex-grow-1" (click)="viewInParts(result)">
                  Parts
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .global-search {
      min-width: 280px;
    }

    .mobile-search-overlay {
      overflow-y: auto;
    }

    kbd {
      font-size: 0.75rem;
    }
  `]
})
export class GlobalSearchComponent implements OnInit, OnDestroy {
  searchQuery = '';
  results: SearchResult[] = [];
  loading = false;
  showResults = false;
  showMobileSearch = false;
  selectedIndex = 0;

  private searchSubject = new Subject<string>();
  private subscriptions: Subscription[] = [];

  constructor(
    private searchService: GlobalSearchService,
    private router: Router,
    private elementRef: ElementRef
  ) {}

  ngOnInit(): void {
    this.subscriptions.push(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(query => {
        this.performSearch(query);
      }),
      this.searchService.results$.subscribe(results => {
        this.results = results;
      }),
      this.searchService.loading$.subscribe(loading => {
        this.loading = loading;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.showResults = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    // Ctrl+K or Cmd+K to focus search
    if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
      event.preventDefault();
      const input = this.elementRef.nativeElement.querySelector('input');
      if (input) {
        input.focus();
        this.showResults = true;
      }
    }

    // Escape to close
    if (event.key === 'Escape') {
      this.showResults = false;
      this.showMobileSearch = false;
    }
  }

  onSearchInput(): void {
    this.selectedIndex = 0;
    if (this.searchQuery.length >= 2) {
      this.searchSubject.next(this.searchQuery);
    } else {
      this.results = [];
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.showResults || this.results.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.results[this.selectedIndex]) {
          this.selectResult(this.results[this.selectedIndex]);
        }
        break;
    }
  }

  async performSearch(query: string): Promise<void> {
    if (query.length < 2) {
      this.searchService.clearResults();
      return;
    }

    await this.searchService.search(query);
  }

  selectResult(result: SearchResult): void {
    this.goToOrder(result);
  }

  goToOrder(result: SearchResult): void {
    this.router.navigate(['/orders', result.order_id]);
    this.showResults = false;
    this.showMobileSearch = false;
    this.searchQuery = '';
    this.results = [];
  }

  viewInParts(result: SearchResult): void {
    this.router.navigate(['/parts'], { queryParams: { search: result.part_number } });
    this.showResults = false;
    this.showMobileSearch = false;
    this.searchQuery = '';
    this.results = [];
  }

  toggleMobileSearch(): void {
    this.showMobileSearch = !this.showMobileSearch;
  }

  closeMobileSearch(): void {
    this.showMobileSearch = false;
    this.searchQuery = '';
    this.results = [];
  }
}
