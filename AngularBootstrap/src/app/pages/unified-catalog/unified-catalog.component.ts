import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { NgbModal, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { BomBridgeService } from '../../services/bom-bridge.service';
import { BomTemplatesService } from '../../services/bom-templates.service';
import { PartsService } from '../../services/parts.service';
import { UnifiedListItem, ClassificationType } from '../../models';
import { UnifiedDetailComponent } from '../../components/parts/unified-detail.component';
import { PartDetailComponent } from '../../components/parts/part-detail.component';

type ViewTab = 'all' | 'templates' | 'assemblies' | 'parts';
type SortOption = 'name' | 'type' | 'recent';

@Component({
  selector: 'app-unified-catalog',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbDropdownModule],
  templateUrl: './unified-catalog.component.html',
  styleUrls: ['./unified-catalog.component.css']
})
export class UnifiedCatalogComponent implements OnInit, OnDestroy {
  // View state
  activeTab: ViewTab = 'all';
  searchQuery = '';
  sortBy: SortOption = 'name';

  // Data
  allItems: UnifiedListItem[] = [];
  filteredItems: UnifiedListItem[] = [];

  // Stats
  stats = {
    total: 0,
    templates: 0,
    assemblies: 0,
    parts: 0
  };

  // Loading
  loading = false;

  // Subscriptions
  private subscriptions: Subscription[] = [];

  constructor(
    private bridge: BomBridgeService,
    private bomTemplates: BomTemplatesService,
    private parts: PartsService,
    private modalService: NgbModal,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  /**
   * Load all items from bridge service
   */
  private loadData(): void {
    this.loading = true;

    // Subscribe to unified list
    const itemsSub = this.bridge.listAllItems().subscribe(items => {
      this.allItems = items;
      this.updateStats();
      this.applyFilters();
      this.loading = false;
    });

    this.subscriptions.push(itemsSub);
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.total = this.allItems.length;
    this.stats.templates = this.allItems.filter(item => item.type === 'template').length;
    this.stats.assemblies = this.allItems.filter(item =>
      item.type === 'part' &&
      item.badges.some(b => b.text === 'Assembly')
    ).length;
    this.stats.parts = this.allItems.filter(item =>
      item.type === 'part' &&
      !item.badges.some(b => b.text === 'Assembly')
    ).length;
  }

  /**
   * Switch view tab
   */
  selectTab(tab: ViewTab): void {
    this.activeTab = tab;
    this.applyFilters();
  }

  /**
   * Apply filters and search
   */
  applyFilters(): void {
    let items = [...this.allItems];

    // Filter by active tab
    switch (this.activeTab) {
      case 'templates':
        items = items.filter(item => item.type === 'template');
        break;
      case 'assemblies':
        items = items.filter(item =>
          item.type === 'part' &&
          item.badges.some(b => b.text === 'Assembly')
        );
        break;
      case 'parts':
        items = items.filter(item =>
          item.type === 'part' &&
          !item.badges.some(b => b.text === 'Assembly')
        );
        break;
      // 'all' - no filter
    }

    // Search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      items = items.filter(item =>
        item.displayName.toLowerCase().includes(query) ||
        item.subtitle.toLowerCase().includes(query)
      );
    }

    // Sort
    items = this.sortItems(items);

    this.filteredItems = items;
  }

  /**
   * Sort items
   */
  private sortItems(items: UnifiedListItem[]): UnifiedListItem[] {
    switch (this.sortBy) {
      case 'name':
        return items.sort((a, b) => a.displayName.localeCompare(b.displayName));
      case 'type':
        return items.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'template' ? -1 : 1;
          }
          return a.displayName.localeCompare(b.displayName);
        });
      case 'recent':
        // Assuming items are already in creation order
        return items.reverse();
      default:
        return items;
    }
  }

  /**
   * Open item detail
   */
  openItem(item: UnifiedListItem): void {
    const modalRef = this.modalService.open(UnifiedDetailComponent, {
      size: 'lg',
      scrollable: true
    });

    modalRef.componentInstance.itemId = item.id;
    modalRef.componentInstance.itemType = item.type;

    modalRef.componentInstance.itemUpdated.subscribe(() => {
      // Reload data when item is updated
      this.loadData();
    });

    modalRef.result.then(
      (result) => {
        if (result === 'converted' || result === 'saved') {
          this.loadData(); // Reload list after conversion
        }
      },
      () => {
        // Modal dismissed
      }
    );
  }

  /**
   * Show new template dialog
   */
  showNewTemplateDialog(): void {
    this.router.navigate(['/templates']);
  }

  /**
   * Show new assembly dialog
   */
  showNewAssemblyDialog(): void {
    const modalRef = this.modalService.open(PartDetailComponent, {
      size: 'xl',
      backdrop: 'static'
    });
    modalRef.componentInstance.isNew = true;
    modalRef.componentInstance.initialClassification = 'assembly';

    modalRef.result.then(
      () => {
        this.loadData(); // Reload list after creating assembly
      },
      () => {
        // Modal dismissed
      }
    );
  }

  /**
   * Show new part dialog
   */
  showNewPartDialog(): void {
    const modalRef = this.modalService.open(PartDetailComponent, {
      size: 'xl',
      backdrop: 'static'
    });
    modalRef.componentInstance.isNew = true;

    modalRef.result.then(
      () => {
        this.loadData(); // Reload list after creating part
      },
      () => {
        // Modal dismissed
      }
    );
  }
}
