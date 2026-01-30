import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { UtilsService } from '../../services/utils.service';

interface ActivityItem {
  id: string;
  type: 'pick' | 'issue_created' | 'issue_resolved';
  action: string;
  details: string;
  user: string;
  timestamp: string;
  order_id?: string;
  so_number?: string;
  part_number?: string;
  qty?: number;
}

interface GroupedActivities {
  [date: string]: ActivityItem[];
}

const PAGE_SIZE = 50;

@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="space-y-4">
      <!-- Header -->
      <div class="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3">
        <div>
          <h1 class="h3 fw-bold d-flex align-items-center gap-2 mb-1">
            <i class="bi bi-clock-history"></i>
            Activity Log
          </h1>
          <p class="text-muted mb-0">Track who did what and when</p>
        </div>
        <button class="btn btn-outline-secondary d-flex align-items-center gap-2" (click)="fetchActivities()">
          <i class="bi bi-arrow-clockwise" [class.spin]="loading"></i>
          Refresh
        </button>
      </div>

      <!-- Search -->
      <div class="card">
        <div class="card-body">
          <div class="position-relative">
            <i class="bi bi-search position-absolute top-50 translate-middle-y" style="left: 12px;"></i>
            <input
              type="text"
              class="form-control ps-5"
              placeholder="Search by name, part number, or SO number..."
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
          <h5 class="card-title mb-0">Recent Activity</h5>
          <small class="text-muted">
            {{ totalCount > 0 ? (totalCount | number) + ' total records' : 'Loading...' }}
          </small>
        </div>
        <div class="card-body">
          <!-- Loading -->
          <div *ngIf="loading && activities.length === 0" class="text-center py-5">
            <i class="bi bi-arrow-clockwise spin fs-3 text-muted"></i>
          </div>

          <!-- Empty State -->
          <div *ngIf="!loading && filteredActivities.length === 0" class="text-center py-5 text-muted">
            {{ searchQuery ? 'No activities match your search' : 'No activity recorded yet' }}
          </div>

          <!-- Activity List -->
          <div *ngIf="filteredActivities.length > 0">
            <div *ngFor="let dateGroup of groupedDates" class="mb-4">
              <!-- Date Header -->
              <h6 class="text-muted small fw-semibold mb-3 sticky-top bg-white py-1">
                {{ formatDateHeader(dateGroup) }}
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
                        {{ activity.user }}
                      </span>
                      <span [class]="getActivityBadgeClass(activity.type)">
                        {{ getActivityBadgeText(activity.type) }}
                      </span>
                      <a
                        *ngIf="activity.so_number"
                        [routerLink]="['/orders', activity.order_id]"
                        class="text-primary text-decoration-none small"
                      >
                        SO-{{ activity.so_number }}
                      </a>
                    </div>
                    <p class="text-muted small mb-0 mt-1">
                      {{ activity.action }}: <span class="font-monospace">{{ activity.details }}</span>
                    </p>
                  </div>

                  <!-- Time -->
                  <div class="text-muted small text-nowrap">
                    {{ formatTime(activity.timestamp) }}
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
              <span class="text-muted small">Page {{ page + 1 }}</span>
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
export class ActivityLogComponent implements OnInit, OnDestroy {
  activities: ActivityItem[] = [];
  loading = true;
  searchQuery = '';
  page = 0;
  hasMore = true;
  totalCount = 0;

  constructor(
    private supabase: SupabaseService,
    private utils: UtilsService
  ) {}

  ngOnInit(): void {
    this.fetchActivities();
  }

  ngOnDestroy(): void {}

  get filteredActivities(): ActivityItem[] {
    if (!this.searchQuery) return this.activities;

    const query = this.searchQuery.toLowerCase();
    return this.activities.filter(activity =>
      activity.user.toLowerCase().includes(query) ||
      activity.details.toLowerCase().includes(query) ||
      activity.action.toLowerCase().includes(query) ||
      (activity.so_number && activity.so_number.toLowerCase().includes(query)) ||
      (activity.part_number && activity.part_number.toLowerCase().includes(query))
    );
  }

  get groupedActivities(): GroupedActivities {
    const groups: GroupedActivities = {};

    for (const activity of this.filteredActivities) {
      const date = new Date(activity.timestamp).toISOString().split('T')[0];
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

  async fetchActivities(): Promise<void> {
    try {
      this.loading = true;

      // Fetch picks with related data
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
            order_id,
            orders!inner (
              so_number
            )
          )
        `, { count: 'exact' })
        .order('picked_at', { ascending: false })
        .range(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE - 1);

      if (picksError) {
        console.error('Error fetching picks:', picksError);
      }

      // Fetch issues (only on first page)
      let issuesData: any[] = [];
      if (this.page === 0) {
        const { data, error: issuesError } = await this.supabase.from('issues')
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
          `)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

        if (issuesError) {
          console.error('Error fetching issues:', issuesError);
        } else {
          issuesData = data || [];
        }
      }

      // Combine and format activities
      const allActivities: ActivityItem[] = [];

      // Add picks
      if (picksData) {
        for (const pick of picksData as any[]) {
          allActivities.push({
            id: `pick-${pick.id}`,
            type: 'pick',
            action: 'Picked parts',
            details: `${pick.qty_picked}x ${pick.line_items.part_number}`,
            user: pick.picked_by || 'Unknown',
            timestamp: pick.picked_at,
            order_id: pick.line_items.order_id,
            so_number: pick.line_items.orders.so_number,
            part_number: pick.line_items.part_number,
            qty: pick.qty_picked,
          });
        }
      }

      // Add issues (only on first page)
      for (const issue of issuesData) {
        // Issue created
        allActivities.push({
          id: `issue-created-${issue.id}`,
          type: 'issue_created',
          action: `Reported ${issue.issue_type.replace('_', ' ')}`,
          details: `${issue.line_items.part_number}${issue.description ? `: ${issue.description}` : ''}`,
          user: issue.reported_by || 'Unknown',
          timestamp: issue.created_at,
          order_id: issue.line_items.order_id,
          so_number: issue.line_items.orders.so_number,
          part_number: issue.line_items.part_number,
        });

        // Issue resolved
        if (issue.status === 'resolved' && issue.resolved_at) {
          allActivities.push({
            id: `issue-resolved-${issue.id}`,
            type: 'issue_resolved',
            action: 'Resolved issue',
            details: `${issue.line_items.part_number} - ${issue.issue_type.replace('_', ' ')}`,
            user: issue.resolved_by || 'Unknown',
            timestamp: issue.resolved_at,
            order_id: issue.line_items.order_id,
            so_number: issue.line_items.orders.so_number,
            part_number: issue.line_items.part_number,
          });
        }
      }

      // Sort by timestamp descending
      allActivities.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      this.activities = allActivities;
      this.totalCount = picksCount || 0;
      this.hasMore = (picksData?.length || 0) === PAGE_SIZE;
    } catch (err) {
      console.error('Error fetching activities:', err);
    } finally {
      this.loading = false;
    }
  }

  prevPage(): void {
    if (this.page > 0) {
      this.page--;
      this.fetchActivities();
    }
  }

  nextPage(): void {
    if (this.hasMore) {
      this.page++;
      this.fetchActivities();
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

  getActivityIconClass(type: ActivityItem['type']): string {
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

  getActivityBadgeClass(type: ActivityItem['type']): string {
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

  getActivityBadgeText(type: ActivityItem['type']): string {
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
}
