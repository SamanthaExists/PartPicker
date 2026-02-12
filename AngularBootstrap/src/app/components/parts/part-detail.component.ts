import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { PartsService, Part, ClassificationType } from '../../services/parts.service';
import { ClassificationBadgeComponent } from './classification-badge.component';
import { BOMEditorComponent } from './bom-editor.component';
import { ModificationChainComponent } from './modification-chain.component';

@Component({
  selector: 'app-part-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ClassificationBadgeComponent, BOMEditorComponent, ModificationChainComponent],
  templateUrl: './part-detail.component.html'
})
export class PartDetailComponent implements OnInit {
  @Input() partId?: string;
  @Input() isNew = false;
  @Input() initialClassification?: ClassificationType;

  part: any = null;
  loading = true;
  isEditing = false;

  editForm = {
    part_number: '',
    description: '',
    classification_type: '' as ClassificationType | '',
    default_location: '',
    notes: '',
    is_assembly: false,
    is_modified: false
  };

  constructor(
    public activeModal: NgbActiveModal,
    private partsService: PartsService
  ) {}

  async ngOnInit(): Promise<void> {
    if (this.isNew) {
      this.isEditing = true;
      if (this.initialClassification) {
        this.editForm.classification_type = this.initialClassification;
      }
      this.loading = false;
    } else if (this.partId) {
      await this.loadPart();
    }
  }

  async loadPart(): Promise<void> {
    this.loading = true;
    if (this.partId) {
      this.part = await this.partsService.getPartWithRelationships(this.partId);
      if (this.part) {
        this.editForm = {
          part_number: this.part.part_number,
          description: this.part.description || '',
          classification_type: this.part.classification_type || '',
          default_location: this.part.default_location || '',
          notes: this.part.notes || '',
          is_assembly: this.part.is_assembly || false,
          is_modified: this.part.is_modified || false
        };
      }
    }
    this.loading = false;
  }

  async save(): Promise<void> {
    if (this.isNew) {
      await this.partsService.createPart({
        part_number: this.editForm.part_number.trim(),
        description: this.editForm.description.trim() || null,
        classification_type: this.editForm.classification_type || null,
        default_location: this.editForm.default_location.trim() || null,
        base_part_id: null,
        notes: this.editForm.notes.trim() || null,
        is_assembly: this.editForm.is_assembly,
        is_modified: this.editForm.is_modified
      });
      this.activeModal.close();
    } else if (this.partId) {
      await this.partsService.updatePart(this.partId, {
        part_number: this.editForm.part_number.trim(),
        description: this.editForm.description.trim() || null,
        classification_type: this.editForm.classification_type || null,
        default_location: this.editForm.default_location.trim() || null,
        notes: this.editForm.notes.trim() || null,
        is_assembly: this.editForm.is_assembly,
        is_modified: this.editForm.is_modified
      });
      await this.loadPart();
      this.isEditing = false;
    }
  }

  cancel(): void {
    if (this.isNew) {
      this.activeModal.dismiss();
    } else {
      this.isEditing = false;
      if (this.part) {
        this.editForm = {
          part_number: this.part.part_number,
          description: this.part.description || '',
          classification_type: this.part.classification_type || '',
          default_location: this.part.default_location || '',
          notes: this.part.notes || '',
          is_assembly: this.part.is_assembly || false,
          is_modified: this.part.is_modified || false
        };
      }
    }
  }

  get isAssembly(): boolean {
    return this.part?.is_assembly || false;
  }

  get isModified(): boolean {
    return this.part?.is_modified || false;
  }

  onAssemblyChange(): void {
    if (this.editForm.is_assembly && this.editForm.is_modified) {
      this.editForm.is_modified = false;
    }
  }

  onModifiedChange(): void {
    if (this.editForm.is_modified && this.editForm.is_assembly) {
      this.editForm.is_assembly = false;
    }
  }

  getClassificationBadgeClass(type: ClassificationType): string {
    const classes: Record<ClassificationType, string> = {
      purchased: 'badge bg-primary',
      manufactured: 'badge bg-warning text-dark',
      assembly: 'badge bg-secondary',
      modified: 'badge bg-info text-dark'
    };
    return classes[type];
  }
}
