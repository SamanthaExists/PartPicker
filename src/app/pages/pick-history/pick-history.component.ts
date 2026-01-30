import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { ExcelService } from '../../services/excel.service';

interface PickRecord {
  id: string;
  qty_picked: number;
  picked_by: string | null;
  picked_at: string;
  notes: string | null;
  part_number: string;
  description: string | null;
  location: string | null;
  tool_number: string;
  so_number: string;
  order_id: string;
}

interface GroupedPicks {
  [date: string]: PickRecord[];
}

interface DatePreset {
  label: string;
  getValue: () => { start: Date; end: Date };
}

const PAGE_SIZE = 50;

@Component({
  selector: 'app-pick-history',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="space-y-4">
      <!-- Header -->
      <div class="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3">
        <div>
          <h1 class="h3 fw-bold d-flex align-items-center gap-2 mb-1">
            <i class="bi bi-clock"></i>
            Pick History
          </h1>
          <p class="text-muted mb-0">Filter picks by date and time range</p>
        </div>
      </div>

      <!-- Date Range Filter -->
      <div class="card">
        <div class="card-header">
          <h5 class="card-title mb-0 d-flex align-items-center gap-2">
            <i class="bi bi-funnel"></i>
            Date & Time Filter
          </h5>
        </div>
        <div class="card-body">
          <!-- Quick Presets -->
          <div class="d-flex flex-wrap gap-2 mb-3">
            <button
              *ngFor="let preset of datePresets"
              class="btn btn-outline-secondary btn-sm"
              (click)="applyPreset(preset)"
            >
              {{ preset.label }}
            </button>
          </div>

          <!-- Custom Date/Time Range -->
          <div class="row g-3 mb-3">
            <div class="col-12 col-sm-6">
              <label for="start-date" class="form-label d-flex align-items-center gap-1">
                <i class="bi bi-calendar"></i>
                Start Date & Time
              </label>
              <input
                id="start-date"
                type="datetime-local"
                class="form-control"
                [(ngModel)]="startDate"
              />
            </div>
            <div class="col-12 col-sm-6">
              <label for="end-date" class="form-label d-flex align-items-center gap-1">
                <i class="bi bi-calendar"></i>
                End Date & Time
              </label>
              <input
                id="end-date"
                type="datetime-local"
                class="form-control"
                [(ngModel)]="endDate"
              />
            </div>
          </div>

          <!-- Search Button -->
          <div class="d-flex flex-column flex-sm-row gap-2">
            <button class="btn btn-primary" [disabled]="loading" (click)="fetchPicks()">
              <i class="bi bi-search me-2" [class.spin]="loading"></i>
              {{ loading ? 'Searching...' : 'Search Picks' }}
            </button>
            <button
              *ngIf="hasSearched && filteredPicks.length > 0"
              class="btn btn-outline-secondary"
              (click)="exportToExcel()"
            >
              <i class="bi bi-download me-2"></i>
              Export to Excel
            </button>
          </div>
        </div>
      </div>

      <!-- Results -->
      <ng-container *ngIf="hasSearched">
        <!-- Summary Stats -->
        <div class="row g-3">
          <div class="col-6 col-sm-3">
            <div class="card">
              <div class="card-body py-3">
                <div class="fs-4 fw-bold">{{ totalCount | number }}</div>
                <p class="text-muted small mb-0">Total Picks</p>
              </div>
            </div>
          </div>
          <div class="col-6 col-sm-3">
            <div class="card">
              <div class="card-body py-3">
                <div class="fs-4 fw-bold">{{ summaryStats.totalQty | number }}</div>
                <p class="text-muted small mb-0">Total Qty Picked</p>
              </div>
            </div>
          </div>
          <div class="col-6 col-sm-3">
            <div class="card">
              <div class="card-body py-3">
                <div class="fs-4 fw-bold">{{ summaryStats.uniqueParts }}</div>
                <p class="text-muted small mb-0">Unique Parts</p>
              </div>
            </div>
          </div>
          <div class="col-6 col-sm-3">
            <div class="card">
              <div class="card-body py-3">
                <div class="fs-4 fw-bold">{{ summaryStats.uniqueUsers }}</div>
                <p class="text-muted small mb-0">Pickers</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Search Within Results -->
        <div class="card">
          <div class="card-body">
            <div class="position-relative">
              <i class="bi bi-search position-absolute top-50 translate-middle-y" style="left: 12px;"></i>
              <input
                type="text"
                class="form-control ps-5"
                placeholder="Search within results by name, part number, SO number, location..."
                [(ngModel)]="searchQuery"
              />
              <button
                *ngIf="searchQuery"
                class="btn btn-link position-absolute top-50 translate-middle-y p-0"
                style="right: 12px;"
                (click)="searchQuery = ''"
              >
                <i class="bi bi-x-lg text-muted"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Pick List -->
        <div class="card">
          <div class="card-header">
            <h5 class="card-title mb-0 d-flex align-items-center gap-2">
              <i class="bi bi-file-earmark-spreadsheet"></i>
              Pick Records
            </h5>
            <small class="text-muted">
              {{ filteredPicks.length === totalCount
                ? (totalCount | number) + ' picks found'
                : 'Showing ' + filteredPicks.length + ' of ' + (totalCount | number) + ' picks' }}
            </small>
          </div>
          <div class="card-body">
            <!-- Loading -->
            <div *ngIf="loading" class="text-center py-5">
              <i class="bi bi-arrow-clockwise spin fs-3 text-muted"></i>
            </div>

            <!-- Empty State -->
            <div *ngIf="!loading && filteredPicks.length === 0" class="text-center py-5 text-muted">
              {{ searchQuery ? 'No picks match your search' : 'No picks found in this date range' }}
            </div>

            <!-- Pick List -->
            <div *ngIf="!loading && filteredPicks.length > 0">
              <div *ngFor="let dateGroup of groupedDates" class="mb-4">
                <!-- Date Header -->
                <h6 class="text-muted small fw-semibold mb-3 sticky-top bg-white py-1 d-flex justify-content-between align-items-center">
                  <span>{{ formatDateHeader(dateGroup) }}</span>
                  <span class="badge bg-secondary">{{ groupedPicks[dateGroup].length }} picks</span>
                </h6>

                <!-- Picks for this date -->
                <div class="d-flex flex-column gap-2">
                  <div
                    *ngFor="let pick of groupedPicks[dateGroup]"
                    class="d-flex align-items-start gap-3 p-3 border rounded pick-item"
                  >
                    <!-- Icon -->
                    <div class="mt-1">
                      <i class="bi bi-box-seam text-success"></i>
                    </div>

                    <!-- Content -->
                    <div class="flex-grow-1 min-w-0">
                      <div class="d-flex align-items-center gap-2 flex-wrap">
                        <span class="fw-medium d-flex align-items-center gap-1">
                          <i class="bi bi-person text-muted small"></i>
                          {{ pick.picked_by || 'Unknown' }}
                        </span>
                        <span class="badge bg-success-subtle text-success border border-success-subtle">
                          {{ pick.qty_picked }}x
                        </span>
                        <a
                          [routerLink]="['/orders', pick.order_id]"
                          class="text-primary text-decoration-none small"
                        >
                          SO-{{ pick.so_number }}
                        </a>
                        <span class="badge bg-secondary-subtle text-secondary">
                          {{ pick.tool_number }}
                        </span>
                      </div>
                      <p class="small mb-0 mt-1">
                        <span class="font-monospace fw-medium">{{ pick.part_number }}</span>
                        <span *ngIf="pick.description" class="text-muted"> - {{ pick.description }}</span>
                      </p>
                      <p *ngIf="pick.location" class="text-muted small mb-0 mt-1">
                        Location: {{ pick.location }}
                      </p>
                      <p *ngIf="pick.notes" class="text-muted small mb-0 mt-1 fst-italic">
                        Note: {{ pick.notes }}
                      </p>
                    </div>

                    <!-- Time -->
                    <div class="text-muted small text-nowrap">
                      {{ formatTime(pick.picked_at) }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Pagination -->
              <div class="d-flex align-items-center justify-content-between pt-3 border-top">
                <button
                  class="btn btn-outline-secondary btn-sm"
                  [disabled]="page === 0 || loading"
                  (click)="prevPage()"
                >
                  <i class="bi bi-chevron-left me-1"></i>
                  Previous
                </button>
                <span class="text-muted small">
                  Page {{ page + 1 }} of {{ totalPages }}
                </span>
                <button
                  class="btn btn-outline-secondary btn-sm"
                  [disabled]="!hasMore || loading"
                  (click)="nextPage()"
                >
                  Next
                  <i class="bi bi-chevron-right ms-1"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    .spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .pick-item:hover {
      background-color: var(--bs-light);
    }

    .sticky-top {
      z-index: 1;
    }
  `]
})
export class PickHistoryComponent implements OnInit {
  picks: PickRecord[] = [];
  loading = false;
  searchQuery = '';
  page = 0;
  hasMore = true;
  totalCount = 0;
  hasSearched = false;

  // Date filters - default to today
  startDate = '';
  endDate = '';

  datePresets: DatePreset[] = [
    {
      label: 'Today',
      getValue: () => ({
        start: this.startOfDay(new Date()),
        end: this.endOfDay(new Date())
      })
    },
    {
      label: 'Yesterday',
      getValue: () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          start: this.startOfDay(yesterday),
          end: this.endOfDay(yesterday)
        };
      }
    },
    {
      label: 'This Week',
      getValue: () => ({
        start: this.startOfWeek(new Date()),
        end: this.endOfWeek(new Date())
      })
    },
    {
      label: 'Last 7 Days',
      getValue: () => {
        const start = new Date();
        start.setDate(start.getDate() - 6);
        return {
          start: this.startOfDay(start),
          end: this.endOfDay(new Date())
        };
      }
    },
    {
      label: 'This Month',
      getValue: () => ({
        start: this.startOfMonth(new Date()),
        end: this.endOfMonth(new Date())
      })
    },
    {
      label: 'Last 30 Days',
      getValue: () => {
        const start = new Date();
        start.setDate(start.getDate() - 29);
        return {
          start: this.startOfDay(start),
          end: this.endOfDay(new Date())
        };
      }
    }
  ];

  constructor(
    private supabase: SupabaseService,
    private excelService: ExcelService
  ) {}

  ngOnInit(): void {
    // Default to today
    const today = new Date();
    this.startDate = this.formatDateTimeLocal(this.startOfDay(today));
    this.endDate = this.formatDateTimeLocal(this.endOfDay(today));
  }

  get filteredPicks(): PickRecord[] {
    if (!this.searchQuery) return this.picks;

    const query = this.searchQuery.toLowerCase();
    return this.picks.filter(pick =>
      (pick.picked_by && pick.picked_by.toLowerCase().includes(query)) ||
      pick.part_number.toLowerCase().includes(query) ||
      pick.so_number.toLowerCase().includes(query) ||
      pick.tool_number.toLowerCase().includes(query) ||
      (pick.description && pick.description.toLowerCase().includes(query)) ||
      (pick.location && pick.location.toLowerCase().includes(query))
    );
  }

  get groupedPicks(): GroupedPicks {
    const groups: GroupedPicks = {};

    for (const pick of this.filteredPicks) {
      const date = new Date(pick.picked_at).toISOString().split('T')[0];
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(pick);
    }

    return groups;
  }

  get groupedDates(): string[] {
    return Object.keys(this.groupedPicks).sort((a, b) => b.localeCompare(a));
  }

  get summaryStats(): { totalQty: number; uniqueParts: number; uniqueUsers: number; uniqueOrders: number } {
    const totalQty = this.filteredPicks.reduce((sum, p) => sum + p.qty_picked, 0);
    const uniqueParts = new Set(this.filteredPicks.map(p => p.part_number)).size;
    const uniqueUsers = new Set(this.filteredPicks.filter(p => p.picked_by).map(p => p.picked_by)).size;
    const uniqueOrders = new Set(this.filteredPicks.map(p => p.so_number)).size;
    return { totalQty, uniqueParts, uniqueUsers, uniqueOrders };
  }

  get totalPages(): number {
    return Math.ceil(this.totalCount / PAGE_SIZE) || 1;
  }

  applyPreset(preset: DatePreset): void {
    const { start, end } = preset.getValue();
    this.startDate = this.formatDateTimeLocal(start);
    this.endDate = this.formatDateTimeLocal(end);
  }

  async fetchPicks(): Promise<void> {
    try {
      this.loading = true;
      this.hasSearched = true;

      const { data, error, count } = await this.supabase.from('picks')
        .select(`
          id,
          qty_picked,
          picked_by,
          picked_at,
          notes,
          line_items!inner (
            part_number,
            description,
            location,
            order_id,
            orders!inner (
              so_number
            )
          ),
          tools!inner (
            tool_number
          )
        `, { count: 'exact' })
        .gte('picked_at', new Date(this.startDate).toISOString())
        .lte('picked_at', new Date(this.endDate).toISOString())
        .order('picked_at', { ascending: false })
        .range(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE - 1);

      if (error) {
        console.error('Error fetching picks:', error);
        this.picks = [];
        return;
      }

      // Transform the data
      this.picks = (data || []).map((pick: any) => ({
        id: pick.id,
        qty_picked: pick.qty_picked,
        picked_by: pick.picked_by,
        picked_at: pick.picked_at,
        notes: pick.notes,
        part_number: pick.line_items.part_number,
        description: pick.line_items.description,
        location: pick.line_items.location,
        tool_number: pick.tools.tool_number,
        so_number: pick.line_items.orders.so_number,
        order_id: pick.line_items.order_id,
      }));

      this.totalCount = count || 0;
      this.hasMore = (data?.length || 0) === PAGE_SIZE;
    } catch (err) {
      console.error('Error fetching picks:', err);
      this.picks = [];
    } finally {
      this.loading = false;
    }
  }

  prevPage(): void {
    if (this.page > 0) {
      this.page--;
      this.fetchPicks();
    }
  }

  nextPage(): void {
    if (this.hasMore) {
      this.page++;
      this.fetchPicks();
    }
  }

  exportToExcel(): void {
    this.excelService.exportPickHistoryToExcel(
      this.filteredPicks,
      this.startDate,
      this.endDate
    );
  }

  formatDateHeader(date: string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  // Date helper functions
  private formatDateTimeLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private startOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private startOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? 0 : 7); // Adjust for Sunday end
    d.setDate(diff);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private startOfMonth(date: Date): Date {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfMonth(date: Date): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1, 0);
    d.setHours(23, 59, 59, 999);
    return d;
  }
}
