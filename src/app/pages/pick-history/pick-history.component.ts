import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { ExcelService } from '../../services/excel.service';

interface PickRecord {
  id: string;
  type: 'pick';
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

interface IssueRecord {
  id: string;
  type: 'issue_created' | 'issue_resolved';
  issue_type: string;
  description: string | null;
  user: string | null;
  timestamp: string;
  part_number: string;
  so_number: string;
  order_id: string;
}

type ActivityRecord = PickRecord | IssueRecord;

interface GroupedActivities {
  [date: string]: ActivityRecord[];
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
            <i class="bi bi-clock-history"></i>
            Activity History
          </h1>
          <p class="text-muted mb-0">View picks and issues by date range</p>
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

          <!-- Activity Type Filters -->
          <div class="d-flex flex-wrap align-items-center gap-3 mb-3">
            <span class="fw-medium small">Show:</span>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="showPicks" [(ngModel)]="showPicks">
              <label class="form-check-label" for="showPicks">Picks</label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="showIssues" [(ngModel)]="showIssues">
              <label class="form-check-label" for="showIssues">Issues</label>
            </div>
          </div>

          <!-- Search Button -->
          <div class="d-flex flex-column flex-sm-row gap-2">
            <button class="btn btn-primary" [disabled]="loading" (click)="fetchData()">
              <i class="bi bi-search me-2" [class.spin]="loading"></i>
              {{ loading ? 'Searching...' : 'Search' }}
            </button>
            <button
              *ngIf="hasSearched && filteredActivities.length > 0"
              class="btn btn-outline-secondary"
              [disabled]="exporting"
              (click)="exportToExcel()"
            >
              <i class="bi bi-download me-2" [class.spin]="exporting"></i>
              {{ exporting ? 'Exporting...' : 'Export Picks to Excel' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Results -->
      <ng-container *ngIf="hasSearched">
        <!-- Summary Stats -->
        <div class="row g-3">
          <div class="col-6 col-sm">
            <div class="card">
              <div class="card-body py-3">
                <div class="fs-4 fw-bold">{{ totalPickCount | number }}</div>
                <p class="text-muted small mb-0">Picks</p>
              </div>
            </div>
          </div>
          <div class="col-6 col-sm">
            <div class="card">
              <div class="card-body py-3">
                <div class="fs-4 fw-bold">{{ totalQtyPicked | number }}</div>
                <p class="text-muted small mb-0">Qty Picked</p>
              </div>
            </div>
          </div>
          <div class="col-6 col-sm">
            <div class="card">
              <div class="card-body py-3">
                <div class="fs-4 fw-bold">{{ allUniqueParts }}</div>
                <p class="text-muted small mb-0">Unique Parts</p>
              </div>
            </div>
          </div>
          <div class="col-6 col-sm">
            <div class="card">
              <div class="card-body py-3">
                <div class="fs-4 fw-bold">{{ allUniqueUsers }}</div>
                <p class="text-muted small mb-0">Users</p>
              </div>
            </div>
          </div>
          <div class="col-6 col-sm">
            <div class="card">
              <div class="card-body py-3">
                <div class="fs-4 fw-bold">{{ totalIssueCount }}</div>
                <p class="text-muted small mb-0">Issues</p>
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

        <!-- Activity List -->
        <div class="card">
          <div class="card-header">
            <h5 class="card-title mb-0 d-flex align-items-center gap-2">
              <i class="bi bi-file-earmark-spreadsheet"></i>
              Activity Records
            </h5>
            <small class="text-muted">
              {{ filteredActivities.length | number }} records found
            </small>
          </div>
          <div class="card-body">
            <!-- Loading -->
            <div *ngIf="loading" class="text-center py-5">
              <i class="bi bi-arrow-clockwise spin fs-3 text-muted"></i>
            </div>

            <!-- Empty State -->
            <div *ngIf="!loading && filteredActivities.length === 0" class="text-center py-5 text-muted">
              {{ searchQuery ? 'No activities match your search' : 'No activities found in this date range' }}
            </div>

            <!-- Activity List -->
            <div *ngIf="!loading && filteredActivities.length > 0">
              <div *ngFor="let dateGroup of groupedDates" class="mb-4">
                <!-- Date Header -->
                <h6 class="text-muted small fw-semibold mb-3 sticky-top bg-white py-1 d-flex justify-content-between align-items-center">
                  <span>{{ formatDateHeader(dateGroup) }}</span>
                  <span class="badge bg-secondary">{{ groupedActivities[dateGroup].length }} records</span>
                </h6>

                <!-- Activities for this date -->
                <div class="d-flex flex-column gap-2">
                  <div
                    *ngFor="let activity of groupedActivities[dateGroup]"
                    class="d-flex align-items-start gap-3 p-3 border rounded activity-item"
                  >
                    <!-- Icon -->
                    <div class="mt-1">
                      <i [class]="getActivityIconClass(activity.type)"></i>
                    </div>

                    <!-- Content -->
                    <div class="flex-grow-1 min-w-0">
                      <div class="d-flex align-items-center gap-2 flex-wrap">
                        <span class="fw-medium d-flex align-items-center gap-1">
                          <i class="bi bi-person text-muted small"></i>
                          {{ getActivityUser(activity) }}
                        </span>
                        <span [class]="getActivityBadgeClass(activity.type)">
                          {{ getActivityBadgeText(activity.type) }}
                        </span>
                        <span *ngIf="activity.type === 'pick'" class="badge bg-success-subtle text-success border border-success-subtle">
                          {{ activity.qty_picked }}x
                        </span>
                        <a
                          [routerLink]="['/orders', activity.order_id]"
                          class="text-primary text-decoration-none small"
                        >
                          SO-{{ activity.so_number }}
                        </a>
                        <span *ngIf="activity.type === 'pick'" class="badge bg-secondary-subtle text-secondary">
                          {{ activity.tool_number }}
                        </span>
                      </div>
                      <p class="small mb-0 mt-1">
                        <span class="font-monospace fw-medium">{{ activity.part_number }}</span>
                        <ng-container *ngIf="activity.type === 'pick'">
                          <span *ngIf="activity.description" class="text-muted"> - {{ activity.description }}</span>
                        </ng-container>
                        <ng-container *ngIf="activity.type !== 'pick'">
                          <span class="text-muted"> - {{ activity.issue_type.replace('_', ' ') }}</span>
                        </ng-container>
                      </p>
                      <p *ngIf="activity.type === 'pick' && activity.location" class="text-muted small mb-0 mt-1">
                        Location: {{ activity.location }}
                      </p>
                      <p *ngIf="activity.type === 'pick' && activity.notes" class="text-muted small mb-0 mt-1 fst-italic">
                        Note: {{ activity.notes }}
                      </p>
                      <p *ngIf="activity.type !== 'pick' && activity.description" class="text-muted small mb-0 mt-1 fst-italic">
                        {{ activity.description }}
                      </p>
                    </div>

                    <!-- Time -->
                    <div class="text-muted small text-nowrap">
                      {{ formatTime(getActivityTimestamp(activity)) }}
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

    .activity-item:hover {
      background-color: var(--bs-light);
    }

    .sticky-top {
      z-index: 1;
    }
  `]
})
export class PickHistoryComponent implements OnInit {
  picks: PickRecord[] = [];
  issues: IssueRecord[] = [];
  loading = false;
  searchQuery = '';
  page = 0;
  hasMore = true;
  totalPickCount = 0;
  totalQtyPicked = 0;
  allUniqueParts = 0;
  allUniqueUsers = 0;
  totalIssueCount = 0;
  hasSearched = false;
  exporting = false;

  // Activity type filters
  showPicks = true;
  showIssues = true;

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

  get allActivities(): ActivityRecord[] {
    const activities: ActivityRecord[] = [];

    if (this.showPicks) {
      activities.push(...this.picks);
    }

    if (this.showIssues && this.page === 0) {
      activities.push(...this.issues);
    }

    // Sort by timestamp descending
    activities.sort((a, b) => {
      const timeA = a.type === 'pick' ? a.picked_at : a.timestamp;
      const timeB = b.type === 'pick' ? b.picked_at : b.timestamp;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });

    return activities;
  }

  get filteredActivities(): ActivityRecord[] {
    if (!this.searchQuery) return this.allActivities;

    const query = this.searchQuery.toLowerCase();
    return this.allActivities.filter(activity => {
      if (activity.type === 'pick') {
        return (
          (activity.picked_by && activity.picked_by.toLowerCase().includes(query)) ||
          activity.part_number.toLowerCase().includes(query) ||
          activity.so_number.toLowerCase().includes(query) ||
          activity.tool_number.toLowerCase().includes(query) ||
          (activity.description && activity.description.toLowerCase().includes(query)) ||
          (activity.location && activity.location.toLowerCase().includes(query))
        );
      } else {
        return (
          (activity.user && activity.user.toLowerCase().includes(query)) ||
          activity.part_number.toLowerCase().includes(query) ||
          activity.so_number.toLowerCase().includes(query) ||
          activity.issue_type.toLowerCase().includes(query) ||
          (activity.description && activity.description.toLowerCase().includes(query))
        );
      }
    });
  }

  get groupedActivities(): GroupedActivities {
    const groups: GroupedActivities = {};

    for (const activity of this.filteredActivities) {
      const timestamp = activity.type === 'pick' ? activity.picked_at : activity.timestamp;
      const date = new Date(timestamp).toISOString().split('T')[0];
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(activity);
    }

    return groups;
  }

  get groupedDates(): string[] {
    return Object.keys(this.groupedActivities).sort((a, b) => b.localeCompare(a));
  }

  get summaryStats(): { totalQty: number; uniqueParts: number; uniqueUsers: number; pickCount: number; issueCount: number } {
    const picksOnly = this.filteredActivities.filter((a): a is PickRecord => a.type === 'pick');
    const issuesOnly = this.filteredActivities.filter((a): a is IssueRecord => a.type !== 'pick');

    const totalQty = picksOnly.reduce((sum, p) => sum + p.qty_picked, 0);
    const uniqueParts = new Set(picksOnly.map(p => p.part_number)).size;
    const users = [
      ...picksOnly.filter(p => p.picked_by).map(p => p.picked_by),
      ...issuesOnly.filter(i => i.user).map(i => i.user)
    ];
    const uniqueUsers = new Set(users).size;

    return { totalQty, uniqueParts, uniqueUsers, pickCount: picksOnly.length, issueCount: issuesOnly.length };
  }

  get totalPages(): number {
    return Math.ceil(this.totalPickCount / PAGE_SIZE) || 1;
  }

  applyPreset(preset: DatePreset): void {
    const { start, end } = preset.getValue();
    this.startDate = this.formatDateTimeLocal(start);
    this.endDate = this.formatDateTimeLocal(end);
    this.page = 0;
    this.fetchData();
  }

  async fetchData(): Promise<void> {
    try {
      this.loading = true;
      this.hasSearched = true;

      const startISO = new Date(this.startDate).toISOString();
      const endISO = new Date(this.endDate).toISOString();

      // Fetch picks
      const { data: picksData, error: picksError, count: picksCount } = await this.supabase.from('picks')
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
        .gte('picked_at', startISO)
        .lte('picked_at', endISO)
        .order('picked_at', { ascending: false })
        .range(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE - 1);

      if (picksError) {
        console.error('Error fetching picks:', picksError);
      }

      // Transform picks
      this.picks = (picksData || []).map((pick: any) => ({
        id: pick.id,
        type: 'pick' as const,
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

      this.totalPickCount = picksCount || 0;
      this.hasMore = (picksData?.length || 0) === PAGE_SIZE;

      // Fetch ALL picks for accurate stats (separate lightweight query)
      const { data: allPicksData } = await this.supabase.from('picks')
        .select(`
          qty_picked,
          picked_by,
          line_items!inner (
            part_number
          )
        `)
        .gte('picked_at', startISO)
        .lte('picked_at', endISO);

      if (allPicksData) {
        this.totalQtyPicked = allPicksData.reduce((sum: number, p: any) => sum + (p.qty_picked || 0), 0);
        this.allUniqueParts = new Set(allPicksData.map((p: any) => p.line_items?.part_number).filter(Boolean)).size;
        this.allUniqueUsers = new Set(allPicksData.map((p: any) => p.picked_by).filter(Boolean)).size;
      }

      // Fetch issues (only on first page)
      if (this.page === 0) {
        const { data: issuesData, error: issuesError } = await this.supabase.from('issues')
          .select(`
            id,
            issue_type,
            description,
            reported_by,
            status,
            created_at,
            resolved_at,
            resolved_by,
            line_items!inner (
              part_number,
              order_id,
              orders!inner (
                so_number
              )
            )
          `);

        if (issuesError) {
          console.error('Error fetching issues:', issuesError);
        }

        const transformedIssues: IssueRecord[] = [];

        for (const issue of (issuesData || []) as any[]) {
          // Issue created event
          const createdAt = new Date(issue.created_at);
          if (createdAt >= new Date(this.startDate) && createdAt <= new Date(this.endDate)) {
            transformedIssues.push({
              id: `issue-created-${issue.id}`,
              type: 'issue_created',
              issue_type: issue.issue_type,
              description: issue.description,
              user: issue.reported_by,
              timestamp: issue.created_at,
              part_number: issue.line_items.part_number,
              so_number: issue.line_items.orders.so_number,
              order_id: issue.line_items.order_id,
            });
          }

          // Issue resolved event
          if (issue.status === 'resolved' && issue.resolved_at) {
            const resolvedAt = new Date(issue.resolved_at);
            if (resolvedAt >= new Date(this.startDate) && resolvedAt <= new Date(this.endDate)) {
              transformedIssues.push({
                id: `issue-resolved-${issue.id}`,
                type: 'issue_resolved',
                issue_type: issue.issue_type,
                description: issue.description,
                user: issue.resolved_by,
                timestamp: issue.resolved_at,
                part_number: issue.line_items.part_number,
                so_number: issue.line_items.orders.so_number,
                order_id: issue.line_items.order_id,
              });
            }
          }
        }

        this.issues = transformedIssues;
        this.totalIssueCount = transformedIssues.length;
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      this.picks = [];
      this.issues = [];
    } finally {
      this.loading = false;
    }
  }

  prevPage(): void {
    if (this.page > 0) {
      this.page--;
      this.fetchData();
    }
  }

  nextPage(): void {
    if (this.hasMore) {
      this.page++;
      this.fetchData();
    }
  }

  async exportToExcel(): Promise<void> {
    try {
      this.exporting = true;

      const startISO = new Date(this.startDate).toISOString();
      const endISO = new Date(this.endDate).toISOString();

      // Fetch ALL picks in date range using pagination (Supabase limits to 1000 per query)
      const EXPORT_PAGE_SIZE = 1000;
      let allPicksData: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await this.supabase.from('picks')
          .select(`
            id,
            qty_picked,
            picked_by,
            picked_at,
            notes,
            line_items!inner (
              part_number,
              orders!inner (
                so_number
              )
            ),
            tools!inner (
              tool_number
            )
          `)
          .gte('picked_at', startISO)
          .lte('picked_at', endISO)
          .order('picked_at', { ascending: false })
          .range(offset, offset + EXPORT_PAGE_SIZE - 1);

        if (error) {
          console.error('Error fetching picks for export:', error);
          return;
        }

        allPicksData = [...allPicksData, ...(data || [])];
        hasMore = (data?.length || 0) === EXPORT_PAGE_SIZE;
        offset += EXPORT_PAGE_SIZE;
      }

      // Apply search filter if active
      let filteredData = allPicksData;
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        filteredData = filteredData.filter((pick: any) =>
          (pick.picked_by && pick.picked_by.toLowerCase().includes(query)) ||
          pick.line_items.part_number.toLowerCase().includes(query) ||
          pick.line_items.orders.so_number.toLowerCase().includes(query) ||
          pick.tools.tool_number.toLowerCase().includes(query)
        );
      }

      // Transform to export format
      const exportData = filteredData.map((pick: any) => ({
        picked_at: pick.picked_at,
        picked_by: pick.picked_by,
        qty_picked: pick.qty_picked,
        notes: pick.notes,
        part_number: pick.line_items.part_number,
        tool_number: pick.tools.tool_number,
        so_number: pick.line_items.orders.so_number,
      }));

      this.excelService.exportPickHistoryToExcel(
        exportData,
        this.startDate,
        this.endDate
      );
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      this.exporting = false;
    }
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

  getActivityUser(activity: ActivityRecord): string {
    if (activity.type === 'pick') {
      return activity.picked_by || 'Unknown';
    }
    return activity.user || 'Unknown';
  }

  getActivityTimestamp(activity: ActivityRecord): string {
    if (activity.type === 'pick') {
      return activity.picked_at;
    }
    return activity.timestamp;
  }

  getActivityIconClass(type: ActivityRecord['type']): string {
    switch (type) {
      case 'pick':
        return 'bi bi-check-circle-fill text-success';
      case 'issue_created':
        return 'bi bi-exclamation-triangle-fill text-warning';
      case 'issue_resolved':
        return 'bi bi-check-circle-fill text-primary';
      default:
        return 'bi bi-box text-muted';
    }
  }

  getActivityBadgeClass(type: ActivityRecord['type']): string {
    switch (type) {
      case 'pick':
        return 'badge bg-success-subtle text-success border border-success-subtle';
      case 'issue_created':
        return 'badge bg-warning-subtle text-warning border border-warning-subtle';
      case 'issue_resolved':
        return 'badge bg-primary-subtle text-primary border border-primary-subtle';
      default:
        return 'badge bg-secondary-subtle text-secondary';
    }
  }

  getActivityBadgeText(type: ActivityRecord['type']): string {
    switch (type) {
      case 'pick':
        return 'Pick';
      case 'issue_created':
        return 'Issue';
      case 'issue_resolved':
        return 'Resolved';
      default:
        return 'Unknown';
    }
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
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? 0 : 7);
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
