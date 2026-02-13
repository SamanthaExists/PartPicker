import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { PartsService } from '../../services/parts.service';
import { Part, ClassificationType } from '../../models';
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
  @Input() presetClassification?: ClassificationType;

  part: any = null;
  loading = true;
  isEditing = false;
  
  editForm = {
    part_number: '',
    description: '',
    classification_type: '' as ClassificationType | '',
    default_location: '',
    notes: ''
  };

  constructor(
    public activeModal: NgbActiveModal,
    private partsService: PartsService
  ) {}

  async ngOnInit(): Promise<void> {
    if (this.isNew) {
      this.isEditing = true;
      if (this.presetClassification) {
        this.editForm.classification_type = this.presetClassification;
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
          notes: this.part.notes || ''
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
        is_assembly: false,
        is_modified: false,
        default_location: this.editForm.default_location.trim() || null,
        base_part_id: null,
        notes: this.editForm.notes.trim() || null
      });
      this.activeModal.close();
    } else if (this.partId) {
      await this.partsService.updatePart(this.partId, {
        part_number: this.editForm.part_number.trim(),
        description: this.editForm.description.trim() || null,
        classification_type: this.editForm.classification_type || null,
        default_location: this.editForm.default_location.trim() || null,
        notes: this.editForm.notes.trim() || null
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
          notes: this.part.notes || ''
        };
      }
    }
  }

  get isAssembly(): boolean {
    return this.part?.is_assembly === true;
  }

  get isModified(): boolean {
    return this.part?.is_modified === true;
  }

  getClassificationBadgeClass(type: ClassificationType): string {
    const classes: Record<ClassificationType, string> = {
      purchased: 'badge bg-primary',
      manufactured: 'badge bg-warning text-dark'
    };
    return classes[type];
  }
}
