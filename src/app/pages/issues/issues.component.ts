import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, combineLatest } from 'rxjs';
import { IssuesService } from '../../services/issues.service';
import { PartIssuesService } from '../../services/part-issues.service';
import { SettingsService } from '../../services/settings.service';
import { UtilsService } from '../../services/utils.service';
import { IssueWithDetails, PartIssue } from '../../models';

interface UnifiedIssue {
  id: string;
  source: 'order' | 'part';
  issue_type: string;
  description: string | null;
  reported_by: string | null;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_notes: string | null;
  part_number: string | null;
  so_number: string | null;
  order_id: string | null;
}

@Component({
  selector: 'app-issues',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div>
      <div class="page-header d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <h1 class="page-title">Issues</h1>
          <p class="page-subtitle">Track and resolve picking issues</p>
        </div>
      </div>

      <!-- Stats -->
      <div class="row g-3 mb-4">
        <div class="col-6 col-lg-3">
          <div class="card stat-card border-danger">
            <div class="card-body">
              <div class="stat-label">Open Issues</div>
              <div class="stat-value text-danger">{{ openIssuesCount }}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card stat-card border-success">
            <div class="card-body">
              <div class="stat-label">Resolved</div>
              <div class="stat-value text-success">{{ resolvedIssuesCount }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="card filter-bar">
        <div class="card-body">
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-sm"
                    [class.btn-primary]="statusFilter === 'all'"
                    [class.btn-outline-secondary]="statusFilter !== 'all'"
                    (click)="statusFilter = 'all'">All</button>
            <button class="btn btn-sm"
                    [class.btn-danger]="statusFilter === 'open'"
                    [class.btn-outline-danger]="statusFilter !== 'open'"
                    (click)="statusFilter = 'open'">
              Open ({{ openIssuesCount }})
            </button>
            <button class="btn btn-sm"
                    [class.btn-success]="statusFilter === 'resolved'"
                    [class.btn-outline-success]="statusFilter !== 'resolved'"
                    (click)="statusFilter = 'resolved'">
              Resolved ({{ resolvedIssuesCount }})
            </button>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="card">
        <div class="card-body text-center py-5 text-muted">Loading issues...</div>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading && filteredIssues.length === 0" class="card">
        <div class="card-body text-center py-5">
          <i class="bi bi-check-circle display-4 text-success mb-3"></i>
          <p class="text-muted mb-0">
            {{ statusFilter === 'open' ? 'No open issues!' : 'No issues found' }}
          </p>
        </div>
      </div>

      <!-- Issues List -->
      <div *ngIf="!loading && filteredIssues.length > 0" class="d-flex flex-column gap-3">
        <div *ngFor="let issue of filteredIssues" class="card"
             [class.border-danger]="issue.status === 'open'"
             [class.border-success]="issue.status === 'resolved'"
             [class.opacity-75]="issue.status === 'resolved'">
          <div class="card-body">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
              <div class="flex-grow-1">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span class="badge" [ngClass]="utils.getIssueTypeBadgeClass(issue.issue_type)">
                    {{ utils.getIssueTypeLabel(issue.issue_type) }}
                  </span>
                  <span class="badge" [ngClass]="issue.status === 'open' ? 'bg-danger' : 'bg-success'">
                    {{ issue.status === 'open' ? 'Open' : 'Resolved' }}
                  </span>
                  <span class="badge" [ngClass]="issue.source === 'order' ? 'bg-primary-subtle text-primary border border-primary-subtle' : 'bg-info-subtle text-info border border-info-subtle'">
                    {{ issue.source === 'order' ? 'Order' : 'Part' }}
                  </span>
                  <a *ngIf="issue.source === 'order' && issue.order_id" [routerLink]="['/orders', issue.order_id]" class="text-decoration-none small">
                    SO-{{ issue.so_number }}
                  </a>
                </div>
                <p class="fw-medium mb-1" *ngIf="issue.part_number">
                  {{ issue.part_number }}
                </p>
                <p class="text-muted mb-2" *ngIf="issue.description">{{ issue.description }}</p>
                <div class="small text-muted">
                  <span *ngIf="issue.reported_by">Reported by {{ issue.reported_by }}</span>
                  <span> on {{ utils.formatDateTime(issue.created_at) }}</span>
                  <span *ngIf="issue.status === 'resolved' && issue.resolved_at">
                    | Resolved by {{ issue.resolved_by || 'Unknown' }} on {{ utils.formatDateTime(issue.resolved_at) }}
                  </span>
                </div>
              </div>
              <div>
                <button *ngIf="issue.status === 'open'"
                        class="btn btn-sm btn-success"
                        (click)="handleResolveIssue(issue)">
                  <i class="bi bi-check-lg me-1"></i> Resolve
                </button>
                <button *ngIf="issue.status === 'resolved'"
                        class="btn btn-sm btn-outline-warning"
                        (click)="handleReopenIssue(issue)">
                  <i class="bi bi-arrow-counterclockwise me-1"></i> Reopen
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Resolve Issue Confirmation Modal -->
      <div class="modal fade" [class.show]="showResolveModal" [style.display]="showResolveModal ? 'block' : 'none'" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Resolve Issue</h5>
              <button type="button" class="btn-close" (click)="showResolveModal = false"></button>
            </div>
            <div class="modal-body" *ngIf="resolveTarget">
              <p>Are you sure you want to resolve this issue?</p>
              <div class="mb-3">
                <strong>Part:</strong> {{ resolveTarget.part_number || 'N/A' }}
              </div>
              <div class="mb-3" *ngIf="resolveTarget.so_number">
                <strong>SO:</strong> {{ resolveTarget.so_number }}
              </div>
              <div class="mb-3">
                <strong>Issue:</strong> {{ utils.getIssueTypeLabel(resolveTarget.issue_type) }}
              </div>
              <div class="mb-3">
                <label for="resolutionNotes" class="form-label">Resolution Explanation</label>
                <textarea
                  id="resolutionNotes"
                  class="form-control"
                  rows="3"
                  [(ngModel)]="resolutionNotes"
                  placeholder="Enter explanation (optional)"></textarea>
                <small class="text-muted">Describe how the issue was resolved</small>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="showResolveModal = false">Cancel</button>
              <button type="button" class="btn btn-success" (click)="confirmResolveIssue()">
                <i class="bi bi-check-lg me-1"></i> Resolve Issue
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-backdrop fade show" *ngIf="showResolveModal"></div>
    </div>
  `
})
export class IssuesComponent implements OnInit, OnDestroy {
  unifiedIssues: UnifiedIssue[] = [];
  loading = true;
  statusFilter: 'all' | 'open' | 'resolved' = 'open';
  showResolveModal = false;
  resolveTarget: UnifiedIssue | null = null;
  resolutionNotes = '';

  private subscriptions: Subscription[] = [];

  constructor(
    private issuesService: IssuesService,
    private partIssuesService: PartIssuesService,
    private settingsService: SettingsService,
    public utils: UtilsService
  ) {}

  ngOnInit(): void {
    this.issuesService.loadAllIssues();
    this.partIssuesService.initialize();

    this.subscriptions.push(
      combineLatest([
        this.issuesService.issues$,
        this.partIssuesService.issues$,
        this.issuesService.loading$,
        this.partIssuesService.loading$,
      ]).subscribe(([orderIssues, partIssues, orderLoading, partLoading]) => {
        this.loading = orderLoading || partLoading;

        const mappedOrder: UnifiedIssue[] = orderIssues.map(i => ({
          id: i.id,
          source: 'order' as const,
          issue_type: i.issue_type,
          description: i.description,
          reported_by: i.reported_by,
          status: i.status,
          created_at: i.created_at,
          resolved_at: i.resolved_at,
          resolved_by: i.resolved_by,
          resolution_notes: i.resolution_notes,
          part_number: i.line_item?.part_number || null,
          so_number: i.order?.so_number || null,
          order_id: i.order_id,
        }));

        const mappedPart: UnifiedIssue[] = partIssues.map(i => ({
          id: i.id,
          source: 'part' as const,
          issue_type: i.issue_type,
          description: i.description,
          reported_by: i.reported_by,
          status: i.status,
          created_at: i.created_at,
          resolved_at: i.resolved_at,
          resolved_by: i.resolved_by,
          resolution_notes: i.resolution_notes,
          part_number: i.part_number,
          so_number: null,
          order_id: null,
        }));

        const combined = [...mappedOrder, ...mappedPart];
        combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        this.unifiedIssues = combined;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  get filteredIssues(): UnifiedIssue[] {
    if (this.statusFilter === 'all') return this.unifiedIssues;
    return this.unifiedIssues.filter(i => i.status === this.statusFilter);
  }

  get openIssuesCount(): number {
    return this.unifiedIssues.filter(i => i.status === 'open').length;
  }

  get resolvedIssuesCount(): number {
    return this.unifiedIssues.filter(i => i.status === 'resolved').length;
  }

  handleResolveIssue(issue: UnifiedIssue): void {
    this.resolveTarget = issue;
    this.resolutionNotes = '';
    this.showResolveModal = true;
  }

  async confirmResolveIssue(): Promise<void> {
    if (!this.resolveTarget) return;

    const userName = this.settingsService.getUserName();
    const notes = this.resolutionNotes.trim() || undefined;

    if (this.resolveTarget.source === 'order') {
      await this.issuesService.resolveIssue(this.resolveTarget.id, userName, notes);
    } else {
      await this.partIssuesService.resolveIssue(this.resolveTarget.id, userName, notes);
    }

    this.showResolveModal = false;
    this.resolveTarget = null;
    this.resolutionNotes = '';
  }

  async handleReopenIssue(issue: UnifiedIssue): Promise<void> {
    if (issue.source === 'order') {
      await this.issuesService.reopenIssue(issue.id);
    } else {
      await this.partIssuesService.reopenIssue(issue.id);
    }
  }
}
