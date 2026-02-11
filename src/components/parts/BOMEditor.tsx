import { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useParts } from '@/hooks/useParts';
import { usePartRelationships } from '@/hooks/usePartRelationships';
import type { PartWithRelationships, Part } from '@/types';

interface BOMEditorProps {
  partId: string;
  onUpdate?: () => void;
}

export function BOMEditor({ partId, onUpdate }: BOMEditorProps) {
  const { parts, getPartWithRelationships } = useParts();
  const {
    createRelationship,
    updateRelationship,
    deleteRelationship,
    checkCircularReference,
  } = usePartRelationships();
  const [part, setPart] = useState<PartWithRelationships | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showCircularWarning, setShowCircularWarning] = useState(false);
  const [circularWarningMessage, setCircularWarningMessage] = useState('');
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);
  const [newChild, setNewChild] = useState({
    childId: '',
    quantity: '1',
    referenceDesignator: '',
    notes: '',
  });

  useEffect(() => {
    loadPart();
  }, [partId]);

  async function loadPart() {
    setLoading(true);
    const data = await getPartWithRelationships(partId);
    setPart(data);
    setLoading(false);
  }

  async function handleAddChild() {
    if (!newChild.childId) return;

    // Check for circular reference
    const circularCheck = await checkCircularReference(partId, newChild.childId);
    if (circularCheck.would_cycle) {
      setCircularWarningMessage(circularCheck.message);
      setPendingChildId(newChild.childId);
      setShowCircularWarning(true);
      return;
    }

    await createRelationship(
      partId,
      newChild.childId,
      parseInt(newChild.quantity) || 1,
      {
        referenceDesignator: newChild.referenceDesignator || undefined,
        notes: newChild.notes || undefined,
      }
    );

    setNewChild({
      childId: '',
      quantity: '1',
      referenceDesignator: '',
      notes: '',
    });
    setShowAddDialog(false);
    await loadPart();
    onUpdate?.();
  }

  async function handleConfirmCircular() {
    if (!pendingChildId) return;

    await createRelationship(
      partId,
      pendingChildId,
      parseInt(newChild.quantity) || 1,
      {
        referenceDesignator: newChild.referenceDesignator || undefined,
        notes: newChild.notes || undefined,
        skipCircularCheck: true,
      }
    );

    setNewChild({
      childId: '',
      quantity: '1',
      referenceDesignator: '',
      notes: '',
    });
    setShowAddDialog(false);
    setShowCircularWarning(false);
    setPendingChildId(null);
    await loadPart();
    onUpdate?.();
  }

  async function handleDeleteChild(relationshipId: string) {
    await deleteRelationship(relationshipId);
    await loadPart();
    onUpdate?.();
  }

  async function handleUpdateQuantity(relationshipId: string, quantity: number) {
    await updateRelationship(relationshipId, { quantity });
    await loadPart();
    onUpdate?.();
  }

  if (loading || !part) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Loading BOM...</p>
        </CardContent>
      </Card>
    );
  }

  const availableParts = parts.filter((p) => p.id !== partId);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Bill of Materials ({part.children?.length || 0})</CardTitle>
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Part
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!part.children || part.children.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No parts in this assembly yet.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setShowAddDialog(true)}
              >
                Add First Part
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {part.children
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((rel) => (
                  <div
                    key={rel.id}
                    className="flex items-center gap-3 p-3 border rounded hover:bg-accent"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{rel.part.part_number}</span>
                        {rel.reference_designator && (
                          <span className="text-sm text-muted-foreground">
                            ({rel.reference_designator})
                          </span>
                        )}
                      </div>
                      {rel.part.description && (
                        <div className="text-sm text-muted-foreground truncate">
                          {rel.part.description}
                        </div>
                      )}
                      {rel.notes && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Note: {rel.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Label className="text-sm text-muted-foreground">Qty:</Label>
                      <Input
                        type="number"
                        min="1"
                        value={rel.quantity}
                        onChange={(e) =>
                          handleUpdateQuantity(rel.id, parseInt(e.target.value) || 1)
                        }
                        className="w-20"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteChild(rel.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Child Part Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Part to BOM</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="child_part">Part *</Label>
              <Select
                value={newChild.childId}
                onValueChange={(value) =>
                  setNewChild({ ...newChild, childId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a part" />
                </SelectTrigger>
                <SelectContent>
                  {availableParts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.part_number}
                      {p.description && ` - ${p.description}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={newChild.quantity}
                  onChange={(e) =>
                    setNewChild({ ...newChild, quantity: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ref_designator">Reference Designator</Label>
                <Input
                  id="ref_designator"
                  placeholder="e.g., R1, C2"
                  value={newChild.referenceDesignator}
                  onChange={(e) =>
                    setNewChild({ ...newChild, referenceDesignator: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Optional notes"
                value={newChild.notes}
                onChange={(e) =>
                  setNewChild({ ...newChild, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddChild} disabled={!newChild.childId}>
              Add Part
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Circular Reference Warning Dialog */}
      <Dialog open={showCircularWarning} onOpenChange={setShowCircularWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-5 w-5" />
              Circular Reference Warning
            </DialogTitle>
            <DialogDescription>
              {circularWarningMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Do you want to proceed anyway? This may cause issues with BOM explosion and
              inventory tracking.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCircularWarning(false);
                setPendingChildId(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmCircular}>
              Add Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
