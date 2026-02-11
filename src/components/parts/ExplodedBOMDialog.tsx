import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Package, Loader2 } from 'lucide-react';
import { ClassificationBadge } from './ClassificationBadge';
import { supabase } from '@/lib/supabase';
import type { ExplodedPart } from '@/types';

interface ExplodedBOMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partId: string;
  partNumber: string;
  partDescription?: string | null;
}

export function ExplodedBOMDialog({
  open,
  onOpenChange,
  partId,
  partNumber,
  partDescription,
}: ExplodedBOMDialogProps) {
  const [explodedParts, setExplodedParts] = useState<ExplodedPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && partId) {
      fetchExplodedBOM();
    }
  }, [open, partId]);

  async function fetchExplodedBOM() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase.rpc('get_exploded_bom', {
        input_part_id: partId,
      });

      if (fetchError) throw fetchError;

      // Sort by level then part number
      const sorted = (data || []).sort((a, b) => {
        if (a.max_level !== b.max_level) return a.max_level - b.max_level;
        return a.part_number.localeCompare(b.part_number);
      });

      setExplodedParts(sorted);
    } catch (err) {
      console.error('Error fetching exploded BOM:', err);
      setError(err instanceof Error ? err.message : 'Failed to load BOM');
    } finally {
      setLoading(false);
    }
  }

  const totalParts = explodedParts.length;
  const totalQuantity = explodedParts.reduce((sum, p) => sum + p.total_quantity, 0);
  const maxDepth = explodedParts.length > 0 ? Math.max(...explodedParts.map(p => p.max_level)) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-purple-600" />
            Exploded BOM
          </DialogTitle>
          <DialogDescription>
            <div className="space-y-1">
              <div className="font-mono font-semibold text-foreground">{partNumber}</div>
              {partDescription && (
                <div className="text-sm">{partDescription}</div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-4 bg-destructive/10 rounded-lg text-destructive text-sm">
            {error}
          </div>
        ) : explodedParts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>This assembly has no components.</p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-muted/30 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold">{totalParts}</div>
                <div className="text-xs text-muted-foreground">Unique Parts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{totalQuantity}</div>
                <div className="text-xs text-muted-foreground">Total Quantity</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{maxDepth}</div>
                <div className="text-xs text-muted-foreground">Max Depth</div>
              </div>
            </div>

            {/* Parts Table */}
            <div className="flex-1 overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 whitespace-nowrap">Part Number</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-left p-2 whitespace-nowrap">Type</th>
                    <th className="text-center p-2 whitespace-nowrap">Qty</th>
                    <th className="text-center p-2 whitespace-nowrap">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {explodedParts.map((part) => (
                    <tr key={part.part_id} className="border-t hover:bg-accent/50">
                      <td className="p-2 font-mono whitespace-nowrap">{part.part_number}</td>
                      <td className="p-2 text-muted-foreground max-w-[200px] truncate">
                        {part.description || '-'}
                      </td>
                      <td className="p-2">
                        <ClassificationBadge
                          classification={part.classification_type}
                          size="sm"
                        />
                      </td>
                      <td className="p-2 text-center font-medium">{part.total_quantity}</td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className="text-xs">
                          L{part.max_level}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Note */}
            <div className="text-xs text-muted-foreground text-center pt-2 border-t">
              Level 0 = direct children, Level 1+ = nested subassemblies
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
