import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { PartsCatalogItem, PartConflict, ImportedLineItem } from '../models';

@Injectable({
  providedIn: 'root'
})
export class PartsCatalogService implements OnDestroy {
  private partsSubject = new BehaviorSubject<PartsCatalogItem[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private subscription: RealtimeChannel | null = null;

  parts$ = this.partsSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private supabase: SupabaseService) {
    this.fetchParts();
    this.setupRealtimeSubscription();
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private setupRealtimeSubscription(): void {
    this.subscription = this.supabase.channel('parts-catalog-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts_catalog' }, () => this.fetchParts())
      .subscribe();
  }

  async fetchParts(): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      // Use pagination to handle >1000 parts in catalog
      const allParts: PartsCatalogItem[] = [];
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await this.supabase.from('parts_catalog')
          .select('*')
          .order('part_number', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allParts.push(...data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      this.partsSubject.next(allParts);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch parts catalog');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  /**
   * Check imported line items against the catalog and return conflicts
   */
  checkForConflicts(importedItems: ImportedLineItem[]): PartConflict[] {
    const conflicts: PartConflict[] = [];
    const parts = this.partsSubject.getValue();
    const catalogMap = new Map(parts.map(p => [p.part_number, p]));

    for (const item of importedItems) {
      const catalogItem = catalogMap.get(item.part_number);
      if (catalogItem) {
        // Check if description or location differs
        const savedDesc = catalogItem.description || '';
        const importDesc = item.description || '';
        const savedLoc = catalogItem.default_location || '';
        const importLoc = item.location || '';

        if (savedDesc !== importDesc || savedLoc !== importLoc) {
          conflicts.push({
            part_number: item.part_number,
            saved_description: catalogItem.description,
            import_description: item.description || null,
            saved_location: catalogItem.default_location,
            import_location: item.location || null,
            action: null,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Apply resolved conflicts - update catalog where action is 'update'
   */
  async applyConflictResolutions(resolvedConflicts: PartConflict[]): Promise<boolean> {
    try {
      const updatePromises = resolvedConflicts
        .filter(c => c.action === 'update')
        .map(c =>
          this.supabase.from('parts_catalog')
            .update({
              description: c.import_description,
              default_location: c.import_location,
              updated_at: new Date().toISOString(),
            })
            .eq('part_number', c.part_number)
        );

      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        await this.fetchParts();
      }

      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to apply conflict resolutions');
      return false;
    }
  }

  /**
   * Save new parts from import to the catalog
   */
  async savePartsFromImport(items: ImportedLineItem[], skipExisting: boolean = true): Promise<boolean> {
    try {
      const parts = this.partsSubject.getValue();
      const catalogMap = new Map(parts.map(p => [p.part_number, p]));

      const newParts = items
        .filter(item => !skipExisting || !catalogMap.has(item.part_number))
        .map(item => ({
          part_number: item.part_number,
          description: item.description || null,
          default_location: item.location || null,
        }));

      if (newParts.length === 0) return true;

      // Use upsert to handle duplicates
      const { error: insertError } = await this.supabase.from('parts_catalog')
        .upsert(newParts, {
          onConflict: 'part_number',
          ignoreDuplicates: skipExisting,
        });

      if (insertError) throw insertError;
      await this.fetchParts();
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to save parts to catalog');
      return false;
    }
  }

  /**
   * Get part from catalog by part number
   */
  getPart(partNumber: string): PartsCatalogItem | undefined {
    const parts = this.partsSubject.getValue();
    return parts.find(p => p.part_number === partNumber);
  }

  /**
   * Search parts catalog
   */
  searchParts(query: string): PartsCatalogItem[] {
    const parts = this.partsSubject.getValue();
    const lowerQuery = query.toLowerCase();
    return parts.filter(p =>
      p.part_number.toLowerCase().includes(lowerQuery) ||
      p.description?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Add a single part to the catalog
   */
  async addPart(partNumber: string, description?: string, location?: string): Promise<PartsCatalogItem | null> {
    try {
      const { data, error: insertError } = await this.supabase.from('parts_catalog')
        .insert({
          part_number: partNumber,
          description: description || null,
          default_location: location || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      await this.fetchParts();
      return data;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to add part to catalog');
      return null;
    }
  }

  /**
   * Update a part in the catalog
   */
  async updatePart(partNumber: string, updates: { description?: string; default_location?: string }): Promise<boolean> {
    try {
      const { error: updateError } = await this.supabase.from('parts_catalog')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('part_number', partNumber);

      if (updateError) throw updateError;
      await this.fetchParts();
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to update part');
      return false;
    }
  }

  /**
   * Delete a part from the catalog
   */
  async deletePart(partNumber: string): Promise<boolean> {
    try {
      const { error: deleteError } = await this.supabase.from('parts_catalog')
        .delete()
        .eq('part_number', partNumber);

      if (deleteError) throw deleteError;
      await this.fetchParts();
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to delete part');
      return false;
    }
  }
}
