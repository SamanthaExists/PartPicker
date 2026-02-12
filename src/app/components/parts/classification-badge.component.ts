import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClassificationType } from '../../models';

@Component({
  selector: 'app-classification-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="d-flex gap-2 flex-wrap">
      <span *ngIf="classification" [class]="badgeClass">
        <i *ngIf="showIcon" [class]="iconClass + ' me-1'"></i>
        {{ label }}
      </span>
      <span *ngIf="isAssembly" class="badge bg-secondary">
        <i *ngIf="showIcon" class="bi bi-boxes me-1"></i>
        Assembly
      </span>
      <span *ngIf="isModified" class="badge bg-info text-dark">
        <i *ngIf="showIcon" class="bi bi-pencil me-1"></i>
        Modified
      </span>
    </div>
  `,
  styles: [`
    .badge {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-weight: 500;
    }
  `]
})
export class ClassificationBadgeComponent {
  @Input() classification: ClassificationType | null = null;
  @Input() showIcon = true;
  @Input() size: 'sm' | 'md' = 'sm';
  @Input() isAssembly = false;
  @Input() isModified = false;

  private readonly config: Record<ClassificationType, { label: string; icon: string; class: string }> = {
    purchased: {
      label: 'Purchased',
      icon: 'bi-box-seam',
      class: 'badge bg-primary'
    },
    manufactured: {
      label: 'Manufactured',
      icon: 'bi-wrench',
      class: 'badge bg-warning text-dark'
    },
    assembly: {
      label: 'Assembly',
      icon: 'bi-boxes',
      class: 'badge bg-secondary'
    },
    modified: {
      label: 'Modified',
      icon: 'bi-pencil',
      class: 'badge bg-info text-dark'
    }
  };

  get badgeClass(): string {
    if (!this.classification) return '';
    return this.config[this.classification].class;
  }

  get iconClass(): string {
    if (!this.classification) return '';
    return `bi ${this.config[this.classification].icon}`;
  }

  get label(): string {
    if (!this.classification) return '';
    return this.config[this.classification].label;
  }
}
