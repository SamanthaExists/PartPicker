import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Part, PartWithStats, PartWithRelationships, ExplodedPart, ModificationChainItem, ClassificationType } from '@/types';

export function useParts() {
  const [parts, setParts] = useState<PartWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchParts();

    // Subscribe to changes
    const channel = supabase
      .channel('parts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts' }, () => {
        fetchParts();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function fetchParts() {
    try {
      const { data, error: fetchError } = await supabase
        .from('parts_with_stats')
        .select('*')
        .order('part_number', { ascending: true });

      if (fetchError) throw fetchError;
      setParts(data || []);
    } catch (err) {
      console.error('Error fetching parts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch parts');
    } finally {
      setLoading(false);
    }
  }

  async function createPart(part: Omit<Part, 'id' | 'created_at' | 'updated_at'>) {
    try {
      const { data, error: createError } = await supabase
        .from('parts')
        .insert([part])
        .select()
        .single();

      if (createError) throw createError;
      await fetchParts();
      return data;
    } catch (err) {
      console.error('Error creating part:', err);
      throw err;
    }
  }

  async function updatePart(id: string, updates: Partial<Omit<Part, 'id' | 'created_at' | 'updated_at'>>) {
    try {
      const { data, error: updateError } = await supabase
        .from('parts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      await fetchParts();
      return data;
    } catch (err) {
      console.error('Error updating part:', err);
      throw err;
    }
  }

  async function deletePart(id: string) {
    try {
      const { error: deleteError } = await supabase
        .from('parts')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      await fetchParts();
    } catch (err) {
      console.error('Error deleting part:', err);
      throw err;
    }
  }

  async function getPartById(id: string): Promise<Part | null> {
    try {
      const { data, error: fetchError } = await supabase
        .from('parts')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      return data;
    } catch (err) {
      console.error('Error fetching part:', err);
      return null;
    }
  }

  async function getPartByPartNumber(partNumber: string): Promise<Part | null> {
    try {
      const { data, error: fetchError } = await supabase
        .from('parts')
        .select('*')
        .eq('part_number', partNumber)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') return null; // Not found
        throw fetchError;
      }
      return data;
    } catch (err) {
      console.error('Error fetching part by part number:', err);
      return null;
    }
  }

  async function getPartWithRelationships(id: string): Promise<PartWithRelationships | null> {
    try {
      // Fetch the part
      const { data: part, error: partError } = await supabase
        .from('parts')
        .select('*')
        .eq('id', id)
        .single();

      if (partError) throw partError;

      // Fetch children (parts this assembly contains)
      const { data: children, error: childrenError } = await supabase
        .from('part_relationships')
        .select(`
          *,
          part:child_part_id (*)
        `)
        .eq('parent_part_id', id)
        .order('sort_order', { ascending: true });

      if (childrenError) throw childrenError;

      // Fetch used_in (assemblies that use this part)
      const { data: usedIn, error: usedInError } = await supabase
        .from('part_relationships')
        .select(`
          *,
          part:parent_part_id (*)
        `)
        .eq('child_part_id', id);

      if (usedInError) throw usedInError;

      // Fetch base part (if this is a modified part)
      let basePart: Part | undefined;
      if (part.base_part_id) {
        const { data: baseData, error: baseError } = await supabase
          .from('parts')
          .select('*')
          .eq('id', part.base_part_id)
          .single();

        if (!baseError) basePart = baseData;
      }

      // Fetch modifications (parts based on this one)
      const { data: modifications, error: modsError } = await supabase
        .from('parts')
        .select('*')
        .eq('base_part_id', id);

      if (modsError) throw modsError;

      return {
        ...part,
        children: children || [],
        used_in: usedIn || [],
        base_part: basePart,
        modifications: modifications || []
      };
    } catch (err) {
      console.error('Error fetching part with relationships:', err);
      return null;
    }
  }

  async function getExplodedBOM(parentPartId: string): Promise<ExplodedPart[]> {
    try {
      const { data, error: fetchError } = await supabase
        .from('parts_exploded_bom')
        .select('*')
        .eq('parent_part_id', parentPartId)
        .order('part_number', { ascending: true });

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      console.error('Error fetching exploded BOM:', err);
      return [];
    }
  }

  async function getModificationChain(partId: string): Promise<ModificationChainItem[]> {
    try {
      const chain: ModificationChainItem[] = [];
      let currentId: string | null = partId;
      let level = 0;

      // Walk backward to find the original part
      const ancestors: Part[] = [];
      while (currentId) {
        const part = await getPartById(currentId);
        if (!part) break;

        ancestors.unshift(part);
        currentId = part.base_part_id;

        // Prevent infinite loops
        if (level++ > 10) break;
      }

      // Add ancestors with their levels
      ancestors.forEach((part, idx) => {
        chain.push({ part, level: idx });
      });

      // Walk forward to find modifications
      const findModifications = async (baseId: string, baseLevel: number) => {
        const { data: mods } = await supabase
          .from('parts')
          .select('*')
          .eq('base_part_id', baseId);

        if (mods) {
          for (const mod of mods) {
            chain.push({ part: mod, level: baseLevel + 1 });
            await findModifications(mod.id, baseLevel + 1);
          }
        }
      };

      const currentPart = ancestors[ancestors.length - 1];
      if (currentPart) {
        await findModifications(currentPart.id, ancestors.length - 1);
      }

      return chain.sort((a, b) => a.level - b.level);
    } catch (err) {
      console.error('Error getting modification chain:', err);
      return [];
    }
  }

  async function findOrCreatePart(
    partNumber: string,
    description?: string | null,
    location?: string | null,
    classificationType?: ClassificationType | null
  ): Promise<Part> {
    // Try to find existing part
    let part = await getPartByPartNumber(partNumber);

    if (part) {
      // Update if new info provided
      const updates: Partial<Part> = {};
      if (description && !part.description) updates.description = description;
      if (location && !part.default_location) updates.default_location = location;
      if (classificationType && !part.classification_type) updates.classification_type = classificationType;

      if (Object.keys(updates).length > 0) {
        const updated = await updatePart(part.id, updates);
        if (updated) part = updated;
      }
    } else {
      // Create new part
      const created = await createPart({
        part_number: partNumber,
        description: description || null,
        default_location: location || null,
        classification_type: classificationType || null,
        base_part_id: null,
        notes: null
      });
      if (created) part = created;
    }

    if (!part) {
      throw new Error(`Failed to find or create part: ${partNumber}`);
    }

    return part;
  }

  return {
    parts,
    loading,
    error,
    createPart,
    updatePart,
    deletePart,
    getPartById,
    getPartByPartNumber,
    getPartWithRelationships,
    getExplodedBOM,
    getModificationChain,
    findOrCreatePart,
    refetch: fetchParts
  };
}
