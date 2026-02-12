import { Component, Input, OnInit, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { PartsService } from '../../services/parts.service';
import { Part, PartRelationship, CircularReferenceWarning } from '../../models';
import { PartRelationshipsService } from '../../services/part-relationships.service';

@Component({
  selector: 'app-bom-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bom-editor.component.html',
  styles: [`
    .min-w-0 { min-width: 0; }
    .btn-ghost-danger {
      color: var(--bs-danger);
      background-color: transparent;
      border: none;
    }
    .btn-ghost-danger:hover {
      background-color: rgba(var(--bs-danger-rgb), 0.1);
    }
  `]
})
export class BOMEditorComponent implements OnInit {
  @Input() partId: string = '';
  @Output() update = new EventEmitter<void>();

  children: (PartRelationship & { part: Part })[] = [];
  availableParts: Part[] = [];
  loading = true;
  showAddDialog = false;
  showCircularWarning = false;
  circularWarningMessage = '';
  pendingChildId: string | null = null;

  newChild = {
    childId: '',
    quantity: 1,
    referenceDesignator: '',
    notes: ''
  };

  constructor(
    private partsService: PartsService,
    private relationshipsService: PartRelationshipsService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadPart();
    await this.loadAvailableParts();
  }

  async loadPart(): Promise<void> {
    this.loading = true;
    const data = await this.partsService.getPartWithRelationships(this.partId);
    if (data && data.children) {
      this.children = data.children.sort((a: any, b: any) => a.sort_order - b.sort_order);
    }
    this.loading = false;
  }

  async loadAvailableParts(): Promise<void> {
    this.partsService.parts$.subscribe(parts => {
      this.availableParts = parts.filter(p => p.id !== this.partId);
    });
  }

  async addChild(): Promise<void> {
    if (!this.newChild.childId) return;

    const circularCheck = await this.relationshipsService.checkCircularReference(
      this.partId,
      this.newChild.childId
    );

    if (circularCheck.would_cycle) {
      this.circularWarningMessage = circularCheck.message;
      this.pendingChildId = this.newChild.childId;
      this.showCircularWarning = true;
      return;
    }

    await this.createRelationship(false);
  }

  async confirmCircular(): Promise<void> {
    await this.createRelationship(true);
    this.showCircularWarning = false;
    this.pendingChildId = null;
  }

  async createRelationship(skipCheck: boolean): Promise<void> {
    try {
      await this.relationshipsService.createRelationship(
        this.partId,
        this.newChild.childId,
        this.newChild.quantity,
        {
          referenceDesignator: this.newChild.referenceDesignator || undefined,
          notes: this.newChild.notes || undefined,
          skipCircularCheck: skipCheck
        }
      );

      this.newChild = { childId: '', quantity: 1, referenceDesignator: '', notes: '' };
      this.showAddDialog = false;
      await this.loadPart();
      this.update.emit();
    } catch (err) {
      console.error('Error creating relationship:', err);
    }
  }

  async updateQuantity(relationshipId: string, quantity: number): Promise<void> {
    await this.relationshipsService.updateRelationship(relationshipId, { quantity });
    await this.loadPart();
    this.update.emit();
  }

  async deleteChild(relationshipId: string): Promise<void> {
    if (confirm('Are you sure you want to remove this part from the BOM?')) {
      await this.relationshipsService.deleteRelationship(relationshipId);
      await this.loadPart();
      this.update.emit();
    }
  }
}
