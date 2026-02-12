import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

// Part and related types
export type ClassificationType = 'purchased' | 'manufactured' | 'assembly' | 'modified';

export interface Part {
  id: string;
  part_number: string;
  description: string | null;
  default_location: string | null;
  classification_type: ClassificationType | null;
  base_part_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartWithStats extends Part {
  child_count: number;
  used_in_count: number;
}

@Injectable({
  providedIn: 'root'
})
export class PartsService implements OnDestroy {
  private partsSubject = new BehaviorSubject<PartWithStats[]>([]);
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
    this.subscription = this.supabase.channel('parts_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts' }, () => this.fetchParts())
      .subscribe();
  }

  async fetchParts(): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      const { data, error } = await this.supabase.from('parts_with_stats')
        .select('*')
        .order('part_number', { ascending: true });

      if (error) throw error;
      this.partsSubject.next(data || []);
    } catch (err) {
      console.error('Error fetching parts:', err);
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch parts');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async createPart(part: Omit<Part, 'id' | 'created_at' | 'updated_at'>): Promise<Part> {
    try {
      const { data, error } = await this.supabase.from('parts')
        .insert([part])
        .select()
        .single();

      if (error) throw error;
      await this.fetchParts();
      return data;
    } catch (err) {
      console.error('Error creating part:', err);
      throw err;
    }
  }

  async updatePart(id: string, updates: Partial<Omit<Part, 'id' | 'created_at' | 'updated_at'>>): Promise<Part> {
    try {
      const { data, error } = await this.supabase.from('parts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      await this.fetchParts();
      return data;
    } catch (err) {
      console.error('Error updating part:', err);
      throw err;
    }
  }

  async deletePart(id: string): Promise<void> {
    try {
      const { error } = await this.supabase.from('parts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await this.fetchParts();
    } catch (err) {
      console.error('Error deleting part:', err);
      throw err;
    }
  }

  async getPartById(id: string): Promise<Part | null> {
    try {
      const { data, error } = await this.supabase.from('parts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error fetching part:', err);
      return null;
    }
  }

  async getPartByPartNumber(partNumber: string): Promise<Part | null> {
    try {
      const { data, error } = await this.supabase.from('parts')
        .select('*')
        .eq('part_number', partNumber)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      return data;
    } catch (err) {
      console.error('Error fetching part by part number:', err);
      return null;
    }
  }

  /**
   * Find an existing part by part_number or create a new one.
   * Updates description/location/classification if new values are provided.
   */
  async findOrCreatePart(
    partNumber: string,
    description?: string | null,
    location?: string | null,
    classificationType?: ClassificationType | null
  ): Promise<Part> {
    // Try to find existing part
    let part = await this.getPartByPartNumber(partNumber);

    if (part) {
      // Update if new info provided
      const updates: Partial<Part> = {};
      if (description && !part.description) updates.description = description;
      if (location && !part.default_location) updates.default_location = location;
      if (classificationType && !part.classification_type) updates.classification_type = classificationType;

      if (Object.keys(updates).length > 0) {
        part = await this.updatePart(part.id, updates);
      }
    } else {
      // Create new part
      part = await this.createPart({
        part_number: partNumber,
        description: description || null,
        default_location: location || null,
        classification_type: classificationType || null,
        base_part_id: null,
        notes: null
      });
    }

    if (!part) {
      throw new Error(`Failed to find or create part: ${partNumber}`);
    }

    return part;
  }

  async getPartWithRelationships(id: string): Promise<PartWithRelationships | null> {
    try {
      // Fetch the part
      const { data: part, error: partError } = await this.supabase.from('parts')
        .select('*')
        .eq('id', id)
        .single();

      if (partError) throw partError;

      // Fetch children (parts this assembly contains)
      const { data: children, error: childrenError } = await this.supabase.from('part_relationships')
        .select(`
          *,
          part:child_part_id (*)
        `)
        .eq('parent_part_id', id)
        .order('sort_order', { ascending: true });

      if (childrenError) throw childrenError;

      // Fetch used_in (assemblies that use this part)
      const { data: usedIn, error: usedInError } = await this.supabase.from('part_relationships')
        .select(`
          *,
          part:parent_part_id (*)
        `)
        .eq('child_part_id', id);

      if (usedInError) throw usedInError;

      // Fetch base part (if this is a modified part)
      let basePart: Part | undefined;
      if (part.base_part_id) {
        const { data: baseData, error: baseError } = await this.supabase.from('parts')
          .select('*')
          .eq('id', part.base_part_id)
          .single();

        if (!baseError) basePart = baseData;
      }

      // Fetch modifications (parts based on this one)
      const { data: modifications, error: modsError } = await this.supabase.from('parts')
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

  async getExplodedBOM(parentPartId: string): Promise<ExplodedPart[]> {
    try {
      const { data, error: fetchError } = await this.supabase.from('parts_exploded_bom')
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

  async getModificationChain(partId: string): Promise<ModificationChainItem[]> {
    try {
      const chain: ModificationChainItem[] = [];
      let currentId: string | null = partId;
      let level = 0;

      // Walk backward to find the original part
      const ancestors: Part[] = [];
      while (currentId) {
        const part = await this.getPartById(currentId);
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
      const findModifications = async (baseId: string, baseLevel: number): Promise<void> => {
        const { data: mods } = await this.supabase.from('parts')
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

  // Force refetch
  refetch(): Promise<void> {
    return this.fetchParts();
  }
}

// Additional types for relationships
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

export interface PartWithRelationships extends Part {
  children: (PartRelationship & { part: Part })[]; // Parts this assembly contains
  used_in: (PartRelationship & { part: Part })[]; // Assemblies that use this part
  base_part?: Part; // For modified parts: the original part
  modifications?: Part[]; // Parts that are modifications of this one
}

export interface ExplodedPart {
  parent_part_id: string;
  part_id: string;
  part_number: string;
  description: string | null;
  classification_type: ClassificationType | null;
  total_quantity: number;
  max_level: number;
}

export interface ModificationChainItem {
  part: Part;
  level: number; // 0 = original, 1+ = modification depth
}
