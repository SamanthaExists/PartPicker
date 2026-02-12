import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LineItem } from '../../models';

@Component({
  selector: 'app-save-as-template-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal fade" [class.show]="show" [style.display]="show ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-save me-2"></i>Save as BOM Template
            </h5>
            <button type="button" class="btn-close" (click)="close()"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted small mb-3">
              Save this order's parts list as a reusable template. You can use templates when importing new orders.
            </p>

            <div class="mb-3">
              <label class="form-label">Template Name *</label>
              <input
                type="text"
                class="form-control"
                [(ngModel)]="templateName"
                placeholder="e.g., Standard 230Q BOM"
              >
            </div>

            <div class="mb-3">
              <label class="form-label">Tool Model (optional)</label>
              <input
                type="text"
                class="form-control"
                [(ngModel)]="toolModel"
                [placeholder]="defaultToolModel || 'e.g., 230Q'"
              >
              <div class="form-text">Associate this template with a specific tool model</div>
            </div>

            <div class="alert alert-info small">
              <i class="bi bi-info-circle me-2"></i>
              This template will include <strong>{{ lineItemsCount }} parts</strong> from the current order.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="!templateName.trim() || saving"
              (click)="save()"
            >
              <i class="bi me-1" [class]="saving ? 'bi-arrow-clockwise spin' : 'bi-save'"></i>
              {{ saving ? 'Saving...' : 'Save Template' }}
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
export class SaveAsTemplateDialogComponent {
  @Input() show = false;
  @Input() lineItemsCount = 0;
  @Input() defaultToolModel: string | null = null;

  @Output() showChange = new EventEmitter<boolean>();
  @Output() saveTemplate = new EventEmitter<{ name: string; toolModel: string | null }>();

  templateName = '';
  toolModel = '';
  saving = false;

  close(): void {
    this.show = false;
    this.showChange.emit(false);
    this.templateName = '';
    this.toolModel = '';
  }

  save(): void {
    if (!this.templateName.trim()) return;

    this.saving = true;
    this.saveTemplate.emit({
      name: this.templateName.trim(),
      toolModel: this.toolModel.trim() || this.defaultToolModel
    });

    // Parent component should handle closing after save completes
    setTimeout(() => {
      this.saving = false;
      this.close();
    }, 500);
  }
}
