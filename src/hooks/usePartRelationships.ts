import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PartRelationship, CircularReferenceWarning } from '@/types';

export function usePartRelationships() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkCircularReference(parentId: string, childId: string): Promise<CircularReferenceWarning> {
    try {
      const { data, error: checkError } = await supabase
        .rpc('would_create_cycle', {
          p_parent_id: parentId,
          p_child_id: childId
        });

      if (checkError) throw checkError;

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

  async function createRelationship(
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
      setLoading(true);
      setError(null);

      // Check for circular reference unless explicitly skipped
      if (!options?.skipCircularCheck) {
        const circularCheck = await checkCircularReference(parentId, childId);
        if (circularCheck.would_cycle) {
          throw new Error(circularCheck.message);
        }
      }

      const { data, error: insertError } = await supabase
        .from('part_relationships')
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

      if (insertError) throw insertError;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create relationship';
      console.error('Error creating relationship:', err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function updateRelationship(
    id: string,
    updates: Partial<Omit<PartRelationship, 'id' | 'parent_part_id' | 'child_part_id' | 'created_at'>>
  ): Promise<PartRelationship> {
    try {
      setLoading(true);
      setError(null);

      const { data, error: updateError } = await supabase
        .from('part_relationships')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update relationship';
      console.error('Error updating relationship:', err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function deleteRelationship(id: string): Promise<void> {
    try {
      setLoading(true);
      setError(null);

      const { error: deleteError } = await supabase
        .from('part_relationships')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete relationship';
      console.error('Error deleting relationship:', err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function getRelationshipsByParent(parentId: string): Promise<PartRelationship[]> {
    try {
      const { data, error: fetchError } = await supabase
        .from('part_relationships')
        .select('*')
        .eq('parent_part_id', parentId)
        .order('sort_order', { ascending: true });

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      console.error('Error fetching relationships by parent:', err);
      return [];
    }
  }

  async function getRelationshipsByChild(childId: string): Promise<PartRelationship[]> {
    try {
      const { data, error: fetchError } = await supabase
        .from('part_relationships')
        .select('*')
        .eq('child_part_id', childId);

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      console.error('Error fetching relationships by child:', err);
      return [];
    }
  }

  async function reorderRelationships(parentId: string, relationshipIds: string[]): Promise<void> {
    try {
      setLoading(true);
      setError(null);

      // Update sort_order for each relationship
      const updates = relationshipIds.map((id, index) => ({
        id,
        sort_order: index
      }));

      for (const update of updates) {
        await supabase
          .from('part_relationships')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reorder relationships';
      console.error('Error reordering relationships:', err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function bulkCreateRelationships(
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
      setLoading(true);
      setError(null);

      // Check for circular references unless explicitly skipped
      if (!options?.skipCircularCheck) {
        for (const child of children) {
          const circularCheck = await checkCircularReference(parentId, child.childId);
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

      const { data, error: insertError } = await supabase
        .from('part_relationships')
        .upsert(records, { onConflict: 'parent_part_id,child_part_id' })
        .select();

      if (insertError) throw insertError;
      return data || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create relationships';
      console.error('Error bulk creating relationships:', err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    checkCircularReference,
    createRelationship,
    updateRelationship,
    deleteRelationship,
    getRelationshipsByParent,
    getRelationshipsByChild,
    reorderRelationships,
    bulkCreateRelationships
  };
}
