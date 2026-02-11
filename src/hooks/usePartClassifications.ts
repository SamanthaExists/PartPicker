import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Part } from '@/types';

/**
 * Hook to fetch part classifications for a list of part numbers
 * Returns a map of part_number -> Part for quick lookups
 */
export function usePartClassifications(partNumbers: string[]) {
  const [partsMap, setPartsMap] = useState<Map<string, Part>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (partNumbers.length === 0) {
      setPartsMap(new Map());
      setLoading(false);
      return;
    }

    fetchParts();

    // Subscribe to changes
    const channel = supabase
      .channel('part_classifications_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parts' }, () => {
        fetchParts();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [partNumbers.join(',')]);

  async function fetchParts() {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('parts')
        .select('*')
        .in('part_number', partNumbers);

      if (fetchError) throw fetchError;

      const map = new Map<string, Part>();
      (data || []).forEach(part => {
        map.set(part.part_number, part);
      });

      setPartsMap(map);
      setError(null);
    } catch (err) {
      console.error('Error fetching part classifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch parts');
    } finally {
      setLoading(false);
    }
  }

  return { partsMap, loading, error };
}
