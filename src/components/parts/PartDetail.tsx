import { useState, useEffect } from 'react';
import { Edit2, Save, X, Package, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useParts } from '@/hooks/useParts';
import { cn } from '@/lib/utils';
import type { ClassificationType, PartWithRelationships } from '@/types';
import { BOMEditor } from './BOMEditor';
import { ModificationChain } from './ModificationChain';

interface PartDetailProps {
  partId: string;
  open: boolean;
  onClose: () => void;
}

function getClassificationColor(classification: ClassificationType | null): string {
  if (!classification) return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';

  switch (classification) {
    case 'purchased':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'manufactured':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'assembly':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'modified':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
  }
}

export function PartDetail({ partId, open, onClose }: PartDetailProps) {
  const { getPartWithRelationships, updatePart } = useParts();
  const [part, setPart] = useState<PartWithRelationships | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    part_number: '',
    description: '',
    classification_type: '' as ClassificationType | '',
    default_location: '',
    notes: '',
  });

  useEffect(() => {
    if (open && partId) {
      loadPart();
    }
  }, [partId, open]);

  async function loadPart() {
    setLoading(true);
    const data = await getPartWithRelationships(partId);
    setPart(data);
    if (data) {
      setEditForm({
        part_number: data.part_number,
        description: data.description || '',
        classification_type: data.classification_type || '',
        default_location: data.default_location || '',
        notes: data.notes || '',
      });
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!part) return;

    await updatePart(part.id, {
      part_number: editForm.part_number.trim(),
      description: editForm.description.trim() || null,
      classification_type: editForm.classification_type || null,
      default_location: editForm.default_location.trim() || null,
      notes: editForm.notes.trim() || null,
    });

    await loadPart();
    setIsEditing(false);
  }

  function handleCancel() {
    if (part) {
      setEditForm({
        part_number: part.part_number,
        description: part.description || '',
        classification_type: part.classification_type || '',
        default_location: part.default_location || '',
        notes: part.notes || '',
      });
    }
    setIsEditing(false);
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="py-8 text-center">
            <p className="text-muted-foreground">Loading part details...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!part) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="py-8 text-center">
            <p className="text-muted-foreground">Part not found</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isAssembly = part.classification_type === 'assembly';
  const isModified = part.classification_type === 'modified';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Part Details</span>
            {!isEditing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!editForm.part_number.trim()}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Part Information Card */}
          <Card>
            <CardHeader>
              <CardTitle>Part Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit_part_number">Part Number *</Label>
                      <Input
                        id="edit_part_number"
                        value={editForm.part_number}
                        onChange={(e) =>
                          setEditForm({ ...editForm, part_number: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit_classification">Classification</Label>
                      <Select
                        value={editForm.classification_type}
                        onValueChange={(value) =>
                          setEditForm({ ...editForm, classification_type: value as ClassificationType })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select classification" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="purchased">Purchased</SelectItem>
                          <SelectItem value="manufactured">Manufactured</SelectItem>
                          <SelectItem value="assembly">Assembly</SelectItem>
                          <SelectItem value="modified">Modified</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_description">Description</Label>
                    <Input
                      id="edit_description"
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm({ ...editForm, description: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_location">Default Location</Label>
                    <Input
                      id="edit_location"
                      value={editForm.default_location}
                      onChange={(e) =>
                        setEditForm({ ...editForm, default_location: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_notes">Notes</Label>
                    <Textarea
                      id="edit_notes"
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm({ ...editForm, notes: e.target.value })
                      }
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold font-mono">{part.part_number}</span>
                    {part.classification_type && (
                      <Badge className={getClassificationColor(part.classification_type)}>
                        {part.classification_type}
                      </Badge>
                    )}
                  </div>
                  {part.description && (
                    <div>
                      <span className="text-sm text-muted-foreground">Description: </span>
                      <span>{part.description}</span>
                    </div>
                  )}
                  {part.default_location && (
                    <div>
                      <span className="text-sm text-muted-foreground">Location: </span>
                      <span className="font-medium">📍 {part.default_location}</span>
                    </div>
                  )}
                  {part.notes && (
                    <div>
                      <span className="text-sm text-muted-foreground">Notes: </span>
                      <span>{part.notes}</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Base Part (for modified parts) */}
          {isModified && part.base_part && (
            <Card>
              <CardHeader>
                <CardTitle>Based On</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-medium">{part.base_part.part_number}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-medium">{part.part_number}</span>
                  {part.base_part.description && (
                    <span className="text-sm text-muted-foreground ml-2">
                      ({part.base_part.description})
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Modification Chain */}
          {(isModified || (part.modifications && part.modifications.length > 0)) && (
            <ModificationChain partId={part.id} />
          )}

          {/* BOM (for assemblies) */}
          {isAssembly && (
            <BOMEditor partId={part.id} onUpdate={loadPart} />
          )}

          {/* Where Used */}
          {part.used_in && part.used_in.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Where Used ({part.used_in.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {part.used_in.map((rel) => (
                    <div
                      key={rel.id}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <div className="flex items-center gap-3">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-mono font-medium">{rel.part.part_number}</div>
                          {rel.part.description && (
                            <div className="text-sm text-muted-foreground">
                              {rel.part.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Qty: {rel.quantity}
                        {rel.reference_designator && (
                          <span className="ml-2">({rel.reference_designator})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
