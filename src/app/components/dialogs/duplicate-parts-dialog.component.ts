import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PartConflict } from '../../models';

@Component({
  selector: 'app-duplicate-parts-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-exclamation-triangle text-warning me-2"></i>
              Part Conflicts Detected
            </h5>
            <button type="button" class="btn-close" (click)="close()"></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-info small">
              <i class="bi bi-info-circle me-2"></i>
              {{ conflicts.length }} part(s) in the import have different values than what's saved in the Parts Catalog.
              Choose whether to keep the saved value or update with the imported value for each conflict.
            </div>

            <!-- Bulk Actions -->
            <div class="d-flex gap-2 mb-3">
              <button class="btn btn-sm btn-outline-secondary" (click)="setAllActions('keep')">
                Keep All Saved
              </button>
              <button class="btn btn-sm btn-outline-primary" (click)="setAllActions('update')">
                Update All to Import
              </button>
            </div>

            <!-- Conflicts Table -->
            <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
              <table class="table table-sm">
                <thead class="table-light sticky-top">
                  <tr>
                    <th>Part Number</th>
                    <th>Field</th>
                    <th>Saved Value</th>
                    <th>Import Value</th>
                    <th class="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <ng-container *ngFor="let conflict of conflicts; let i = index">
                    <!-- Description conflict row -->
                    <tr *ngIf="conflict.saved_description !== conflict.import_description">
                      <td class="font-monospace" [attr.rowspan]="getRowspan(conflict)">{{ conflict.part_number }}</td>
                      <td>Description</td>
                      <td class="small text-muted">{{ conflict.saved_description || '(empty)' }}</td>
                      <td class="small">{{ conflict.import_description || '(empty)' }}</td>
                      <td class="text-center" [attr.rowspan]="getRowspan(conflict)">
                        <div class="btn-group btn-group-sm">
                          <button
                            class="btn"
                            [class.btn-outline-secondary]="conflict.action !== 'keep'"
                            [class.btn-secondary]="conflict.action === 'keep'"
                            (click)="setAction(conflict, 'keep')"
                          >
                            Keep
                          </button>
                          <button
                            class="btn"
                            [class.btn-outline-primary]="conflict.action !== 'update'"
                            [class.btn-primary]="conflict.action === 'update'"
                            (click)="setAction(conflict, 'update')"
                          >
                            Update
                          </button>
                        </div>
                      </td>
                    </tr>
                    <!-- Location conflict row -->
                    <tr *ngIf="conflict.saved_location !== conflict.import_location && conflict.saved_description === conflict.import_description">
                      <td class="font-monospace">{{ conflict.part_number }}</td>
                      <td>Location</td>
                      <td class="small text-muted">{{ conflict.saved_location || '(empty)' }}</td>
                      <td class="small">{{ conflict.import_location || '(empty)' }}</td>
                      <td class="text-center">
                        <div class="btn-group btn-group-sm">
                          <button
                            class="btn"
                            [class.btn-outline-secondary]="conflict.action !== 'keep'"
                            [class.btn-secondary]="conflict.action === 'keep'"
                            (click)="setAction(conflict, 'keep')"
                          >
                            Keep
                          </button>
                          <button
                            class="btn"
                            [class.btn-outline-primary]="conflict.action !== 'update'"
                            [class.btn-primary]="conflict.action === 'update'"
                            (click)="setAction(conflict, 'update')"
                          >
                            Update
                          </button>
                        </div>
                      </td>
                    </tr>
                    <!-- Second row for location if description is also different -->
                    <tr *ngIf="conflict.saved_description !== conflict.import_description && conflict.saved_location !== conflict.import_location">
                      <td>Location</td>
                      <td class="small text-muted">{{ conflict.saved_location || '(empty)' }}</td>
                      <td class="small">{{ conflict.import_location || '(empty)' }}</td>
                    </tr>
                  </ng-container>
                </tbody>
              </table>
            </div>

            <!-- Summary -->
            <div class="mt-3 small text-muted">
              <strong>Summary:</strong>
              {{ getKeepCount() }} kept,
              {{ getUpdateCount() }} will be updated,
              {{ getUnresolvedCount() }} unresolved
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="getUnresolvedCount() > 0 || saving"
              (click)="confirm()"
            >
              <i class="bi me-1" [class]="saving ? 'bi-arrow-clockwise spin' : 'bi-check-circle'"></i>
              {{ saving ? 'Applying...' : 'Apply Resolutions' }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" *ngIf="show"></div>
  `,
  styles: [`
    .spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class DuplicatePartsDialogComponent {
  @Input() show = false;
  @Input() conflicts: PartConflict[] = [];

  @Output() showChange = new EventEmitter<boolean>();
  @Output() resolved = new EventEmitter<PartConflict[]>();

  saving = false;

  getRowspan(conflict: PartConflict): number {
    let rows = 0;
    if (conflict.saved_description !== conflict.import_description) rows++;
    if (conflict.saved_location !== conflict.import_location) rows++;
    return Math.max(rows, 1);
  }

  setAction(conflict: PartConflict, action: 'keep' | 'update'): void {
    conflict.action = action;
  }

  setAllActions(action: 'keep' | 'update'): void {
    this.conflicts.forEach(c => c.action = action);
  }

  getKeepCount(): number {
    return this.conflicts.filter(c => c.action === 'keep').length;
  }

  getUpdateCount(): number {
    return this.conflicts.filter(c => c.action === 'update').length;
  }

  getUnresolvedCount(): number {
    return this.conflicts.filter(c => c.action === null).length;
  }

  close(): void {
    this.show = false;
    this.showChange.emit(false);
  }

  confirm(): void {
    if (this.getUnresolvedCount() > 0) return;

    this.saving = true;
    this.resolved.emit([...this.conflicts]);

    setTimeout(() => {
      this.saving = false;
      this.close();
    }, 500);
  }
}
