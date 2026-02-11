import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PartIssue, PartIssueType, getPartIssueTypeLabel, getPartIssueTypeColor } from '../../models';

@Component({
  selector: 'app-report-part-issue-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title d-flex align-items-center gap-2">
              <i class="bi bi-exclamation-triangle text-warning"></i>
              {{ existingIssue ? 'Part Issue' : 'Report Part Issue' }}
            </h5>
            <button type="button" class="btn-close" (click)="close()"></button>
          </div>
          <div class="modal-body">
            <!-- Part Info -->
            <div class="bg-body-secondary rounded p-3 mb-3">
              <div class="fw-semibold font-monospace">{{ partNumber }}</div>
              <div class="text-muted small" *ngIf="partDescription">{{ partDescription }}</div>
              <div class="text-muted small" *ngIf="partLocation">
                <i class="bi bi-geo-alt me-1"></i>{{ partLocation }}
              </div>
            </div>

            <!-- Existing Issue View -->
            <div *ngIf="existingIssue && !showNewIssueForm">
              <div class="border border-danger rounded p-3 mb-3">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span class="badge" [ngClass]="getIssueColor(existingIssue.issue_type)">
                    {{ getIssueLabel(existingIssue.issue_type) }}
                  </span>
                  <span class="text-muted small">
                    Reported {{ formatDate(existingIssue.created_at) }}
                  </span>
                </div>
                <p *ngIf="existingIssue.description" class="mb-1">{{ existingIssue.description }}</p>
                <p *ngIf="existingIssue.reported_by" class="text-muted small mb-0">
                  <i class="bi bi-person me-1"></i>{{ existingIssue.reported_by }}
                </p>
              </div>

              <div class="d-flex gap-2">
                <button class="btn btn-success flex-fill" (click)="handleResolve()" [disabled]="submitting">
                  <i class="bi bi-check-circle me-1"></i>
                  {{ submitting ? 'Resolving...' : 'Mark as Resolved' }}
                </button>
                <button class="btn btn-outline-warning" (click)="showNewIssueForm = true">
                  Report Another
                </button>
              </div>
            </div>

            <!-- New Issue Form -->
            <div *ngIf="!existingIssue || showNewIssueForm">
              <div class="mb-3">
                <label class="form-label">Issue Type</label>
                <select class="form-select" [(ngModel)]="issueType">
                  <option value="">Select issue type...</option>
                  <option value="inventory_discrepancy">Inventory Discrepancy</option>
                  <option value="wrong_location">Wrong Location</option>
                  <option value="damaged">Damaged</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Description (optional)</label>
                <textarea
                  class="form-control"
                  rows="3"
                  [(ngModel)]="description"
                  placeholder="E.g., 'System shows 5 in stock but shelf is empty'"
                ></textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer" *ngIf="!existingIssue || showNewIssueForm">
            <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
            <button type="button" class="btn btn-danger" (click)="handleSubmit()"
                    [disabled]="!issueType || submitting">
              <i class="bi bi-exclamation-triangle me-1"></i>
              {{ submitting ? 'Reporting...' : 'Report Issue' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" *ngIf="show"></div>
  `
})
export class ReportPartIssueDialogComponent implements OnChanges {
  @Input() show = false;
  @Input() partNumber: string | null = null;
  @Input() partDescription: string | null = null;
  @Input() partLocation: string | null = null;
  @Input() existingIssue: PartIssue | null = null;

  @Output() showChange = new EventEmitter<boolean>();
  @Output() submitIssue = new EventEmitter<{ issueType: PartIssueType; description: string }>();
  @Output() resolveIssue = new EventEmitter<string>();

  issueType: PartIssueType | '' = '';
  description = '';
  submitting = false;
  showNewIssueForm = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show) {
      this.issueType = '';
      this.description = '';
      this.submitting = false;
      this.showNewIssueForm = false;
    }
  }

  close(): void {
    this.show = false;
    this.showChange.emit(false);
  }

  handleSubmit(): void {
    if (!this.issueType) return;
    this.submitting = true;
    this.submitIssue.emit({
      issueType: this.issueType as PartIssueType,
      description: this.description,
    });
  }

  handleResolve(): void {
    if (!this.existingIssue) return;
    this.submitting = true;
    this.resolveIssue.emit(this.existingIssue.id);
  }

  getIssueLabel(type: PartIssueType): string {
    return getPartIssueTypeLabel(type);
  }

  getIssueColor(type: PartIssueType): string {
    return getPartIssueTypeColor(type);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }
}
