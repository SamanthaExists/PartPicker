import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface PartRelationship {
  id: string;
  parent_part_id: string;
  child_part_id: string;
  quantity: number;
  reference_designator: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
}

export interface CircularReferenceWarning {
  would_cycle: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class PartRelationshipsService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  async checkCircularReference(parentId: string, childId: string): Promise<CircularReferenceWarning> {
    try {
      const { data, error } = await this.supabase.rpc('would_create_cycle', {
        p_parent_id: parentId,
        p_child_id: childId
      });

      if (error) throw error;

      if (data === true) {
        return {
          would_cycle: true,
          message: 'Adding this relationship would create a circular assembly reference. This may cause issues with BOM explosion and inventory tracking.'
        };
      }

      return {
        would_cycle: false,
        message: ''
      };
    } catch (err) {
      console.error('Error checking circular reference:', err);
      // On error, be conservative and warn
      return {
        would_cycle: true,
        message: 'Unable to verify if this would create a circular reference. Proceed with caution.'
      };
    }
  }

  async createRelationship(
    parentId: string,
    childId: string,
    quantity: number,
    options?: {
      referenceDesignator?: string;
      notes?: string;
      sortOrder?: number;
      skipCircularCheck?: boolean;
    }
  ): Promise<PartRelationship> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      // Check for circular reference unless explicitly skipped
      if (!options?.skipCircularCheck) {
        const circularCheck = await this.checkCircularReference(parentId, childId);
        if (circularCheck.would_cycle) {
          throw new Error(circularCheck.message);
        }
      }

      const { data, error } = await this.supabase.from('part_relationships')
        .insert([{
          parent_part_id: parentId,
          child_part_id: childId,
          quantity,
          reference_designator: options?.referenceDesignator || null,
          notes: options?.notes || null,
          sort_order: options?.sortOrder || 0
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create relationship';
      console.error('Error creating relationship:', err);
      this.errorSubject.next(message);
      throw err;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async updateRelationship(
    id: string,
    updates: Partial<Omit<PartRelationship, 'id' | 'parent_part_id' | 'child_part_id' | 'created_at'>>
  ): Promise<PartRelationship> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      const { data, error } = await this.supabase.from('part_relationships')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update relationship';
      console.error('Error updating relationship:', err);
      this.errorSubject.next(message);
      throw err;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async deleteRelationship(id: string): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      const { error } = await this.supabase.from('part_relationships')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete relationship';
      console.error('Error deleting relationship:', err);
      this.errorSubject.next(message);
      throw err;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async getRelationshipsByParent(parentId: string): Promise<PartRelationship[]> {
    try {
      const { data, error } = await this.supabase.from('part_relationships')
        .select('*')
        .eq('parent_part_id', parentId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching relationships by parent:', err);
      return [];
    }
  }

  async getRelationshipsByChild(childId: string): Promise<PartRelationship[]> {
    try {
      const { data, error } = await this.supabase.from('part_relationships')
        .select('*')
        .eq('child_part_id', childId);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching relationships by child:', err);
      return [];
    }
  }

  async reorderRelationships(parentId: string, relationshipIds: string[]): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      // Update sort_order for each relationship
      const updates = relationshipIds.map((id, index) => ({
        id,
        sort_order: index
      }));

      for (const update of updates) {
        await this.supabase.from('part_relationships')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reorder relationships';
      console.error('Error reordering relationships:', err);
      this.errorSubject.next(message);
      throw err;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async bulkCreateRelationships(
    parentId: string,
    children: Array<{
      childId: string;
      quantity: number;
      referenceDesignator?: string;
      notes?: string;
      sortOrder?: number;
    }>,
    options?: {
      skipCircularCheck?: boolean;
    }
  ): Promise<PartRelationship[]> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      // Check for circular references unless explicitly skipped
      if (!options?.skipCircularCheck) {
        for (const child of children) {
          const circularCheck = await this.checkCircularReference(parentId, child.childId);
          if (circularCheck.would_cycle) {
            throw new Error(`${circularCheck.message} (Part: ${child.childId})`);
          }
        }
      }

      const records = children.map((child, index) => ({
        parent_part_id: parentId,
        child_part_id: child.childId,
        quantity: child.quantity,
        reference_designator: child.referenceDesignator || null,
        notes: child.notes || null,
        sort_order: child.sortOrder ?? index
      }));

      const { data, error } = await this.supabase.from('part_relationships')
        .insert(records)
        .select();

      if (error) throw error;
      return data || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create relationships';
      console.error('Error bulk creating relationships:', err);
      this.errorSubject.next(message);
      throw err;
    } finally {
      this.loadingSubject.next(false);
    }
  }
}
