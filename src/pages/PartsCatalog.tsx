import { useState, useMemo } from 'react';
import { Plus, Package, Download, Edit2, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useParts } from '@/hooks/useParts';
import { cn } from '@/lib/utils';
import type { ClassificationType, Part } from '@/types';
import { PartDetail } from '@/components/parts/PartDetail';
import {
  UnifiedFilterBar,
  type StatusButtonOption,
  type SortOption,
} from '@/components/filters';

type PartSortOption = 'part-number' | 'description' | 'classification' | 'location';

const CLASSIFICATION_OPTIONS: StatusButtonOption<ClassificationType | 'all'>[] = [
  { value: 'all', label: 'All', shortLabel: 'All', icon: Package, title: 'Show all parts' },
  { value: 'purchased', label: 'Purchased', shortLabel: 'Purch.', icon: Package, title: 'Show purchased parts' },
  { value: 'manufactured', label: 'Manufactured', shortLabel: 'Mfg.', icon: Package, title: 'Show manufactured parts' },
  { value: 'assembly', label: 'Assembly', shortLabel: 'Assy.', icon: Package, title: 'Show assemblies' },
  { value: 'modified', label: 'Modified', shortLabel: 'Mod.', icon: Package, title: 'Show modified parts' },
];

const SORT_OPTIONS: SortOption<PartSortOption>[] = [
  { value: 'part-number', label: 'Part Number' },
  { value: 'description', label: 'Description' },
  { value: 'classification', label: 'Classification' },
  { value: 'location', label: 'Location' },
];

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

export function PartsCatalog() {
  const { parts, loading, createPart, updatePart, refetch } = useParts();
  const [searchQuery, setSearchQuery] = useState('');
  const [classificationFilter, setClassificationFilter] = useState<ClassificationType | 'all'>('all');
  const [sortBy, setSortBy] = useState<PartSortOption>('part-number');
  const [showNewPartDialog, setShowNewPartDialog] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoDetectResults, setAutoDetectResults] = useState<{
    assembly_name: string;
    components_count: number;
    created_relationships: number;
  }[] | null>(null);
  const [newPart, setNewPart] = useState({
    part_number: '',
    description: '',
    classification_type: '' as ClassificationType | '',
    default_location: '',
    notes: '',
  });

  const handleAutoDetectAssemblies = async () => {
    try {
      setAutoDetecting(true);
      const { data, error } = await supabase.rpc('auto_detect_assemblies_from_orders');

      if (error) throw error;

      setAutoDetectResults(data || []);
      await refetch(); // Refresh parts list
    } catch (error) {
      console.error('Error auto-detecting assemblies:', error);
      alert('Failed to auto-detect assemblies. Please try again.');
    } finally {
      setAutoDetecting(false);
    }
  };

  const filteredAndSortedParts = useMemo(() => {
    // Filter
    const filtered = parts.filter((part) => {
      const matchesSearch =
        part.part_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        part.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        part.default_location?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesClassification =
        classificationFilter === 'all' || part.classification_type === classificationFilter;

      return matchesSearch && matchesClassification;
    });

    // Sort
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'part-number':
          return a.part_number.localeCompare(b.part_number, undefined, { numeric: true });
        case 'description':
          return (a.description || '').localeCompare(b.description || '');
        case 'classification':
          return (a.classification_type || '').localeCompare(b.classification_type || '');
        case 'location':
          return (a.default_location || '').localeCompare(b.default_location || '');
        default:
          return 0;
      }
    });
  }, [parts, searchQuery, classificationFilter, sortBy]);

  const handleCreatePart = async () => {
    if (!newPart.part_number.trim()) return;

    await createPart({
      part_number: newPart.part_number.trim(),
      description: newPart.description.trim() || null,
      classification_type: newPart.classification_type || null,
      default_location: newPart.default_location.trim() || null,
      base_part_id: null,
      notes: newPart.notes.trim() || null,
    });

    setNewPart({
      part_number: '',
      description: '',
      classification_type: '',
      default_location: '',
      notes: '',
    });
    setShowNewPartDialog(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Parts Catalog</h1>
          <p className="text-muted-foreground">
            Manage your parts catalog with classifications and relationships
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button
            variant="outline"
            onClick={handleAutoDetectAssemblies}
            disabled={autoDetecting}
          >
            <Zap className="mr-2 h-4 w-4" />
            {autoDetecting ? 'Detecting...' : 'Auto-Detect Assemblies'}
          </Button>
          <Button onClick={() => setShowNewPartDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Part
          </Button>
        </div>
      </div>

      {/* Filters */}
      <UnifiedFilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by part number, description, or location..."
        statusButtons={CLASSIFICATION_OPTIONS}
        statusValue={classificationFilter}
        onStatusChange={setClassificationFilter}
        sort={{
          options: SORT_OPTIONS,
          value: sortBy,
          onChange: setSortBy,
        }}
        resultCount={filteredAndSortedParts.length}
      />

      {/* Parts List */}
      {loading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Loading parts...</p>
          </CardContent>
        </Card>
      ) : filteredAndSortedParts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              {searchQuery || classificationFilter !== 'all'
                ? 'No parts match your filters'
                : 'No parts yet. Create one to get started.'}
            </p>
            {!searchQuery && classificationFilter === 'all' && (
              <div className="mt-4">
                <Button onClick={() => setShowNewPartDialog(true)}>
                  Create Part
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredAndSortedParts.map((part) => (
            <Card
              key={part.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedPartId(part.id)}
            >
              <CardContent className="py-4">
                <div className="grid grid-cols-12 gap-4 items-center">
                  {/* Part Number & Classification */}
                  <div className="col-span-12 sm:col-span-3 lg:col-span-2">
                    <div className="font-mono font-semibold text-base">{part.part_number}</div>
                    {part.classification_type && (
                      <Badge className={cn("mt-1", getClassificationColor(part.classification_type))}>
                        {part.classification_type}
                      </Badge>
                    )}
                  </div>

                  {/* Description */}
                  <div className="col-span-12 sm:col-span-4 lg:col-span-3">
                    <div className="text-sm text-muted-foreground line-clamp-2">
                      {part.description || <span className="italic">No description</span>}
                    </div>
                  </div>

                  {/* Location */}
                  <div className="col-span-6 sm:col-span-2 lg:col-span-2">
                    <div className="text-xs text-muted-foreground">Location</div>
                    <div className="text-sm font-medium">
                      {part.default_location || <span className="text-muted-foreground italic">—</span>}
                    </div>
                  </div>

                  {/* BOM Stats */}
                  <div className="col-span-6 sm:col-span-2 lg:col-span-2">
                    <div className="text-xs text-muted-foreground">BOM</div>
                    <div className="text-sm">
                      {part.child_count > 0 && <span className="font-medium">{part.child_count} parts</span>}
                      {part.used_in_count > 0 && part.child_count > 0 && <span className="text-muted-foreground"> • </span>}
                      {part.used_in_count > 0 && <span className="text-muted-foreground">{part.used_in_count} assy</span>}
                      {part.child_count === 0 && part.used_in_count === 0 && <span className="text-muted-foreground italic">—</span>}
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="col-span-6 sm:col-span-2 lg:col-span-2">
                    <div className="text-xs text-muted-foreground">Updated</div>
                    <div className="text-sm">
                      {new Date(part.updated_at).toLocaleDateString()}
                    </div>
                  </div>

                  {/* Edit Button */}
                  <div className="col-span-6 sm:col-span-1 lg:col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPartId(part.id);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Notes Row (if present) */}
                {part.notes && (
                  <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                    <span className="font-medium">Notes:</span> {part.notes}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Part Dialog */}
      <Dialog open={showNewPartDialog} onOpenChange={setShowNewPartDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Part</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="part_number">Part Number *</Label>
              <Input
                id="part_number"
                placeholder="e.g., 12345-001"
                value={newPart.part_number}
                onChange={(e) =>
                  setNewPart({ ...newPart, part_number: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="classification_type">Classification</Label>
              <Select
                value={newPart.classification_type}
                onValueChange={(value) =>
                  setNewPart({ ...newPart, classification_type: value as ClassificationType })
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
            <div className="space-y-2 col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Part description"
                value={newPart.description}
                onChange={(e) =>
                  setNewPart({ ...newPart, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="default_location">Default Location</Label>
              <Input
                id="default_location"
                placeholder="e.g., A-01-03"
                value={newPart.default_location}
                onChange={(e) =>
                  setNewPart({ ...newPart, default_location: e.target.value })
                }
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes..."
                value={newPart.notes}
                onChange={(e) =>
                  setNewPart({ ...newPart, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPartDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreatePart}
              disabled={!newPart.part_number.trim()}
            >
              Create Part
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Detect Results Dialog */}
      <Dialog open={!!autoDetectResults} onOpenChange={() => setAutoDetectResults(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Auto-Detect Assemblies Results</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {autoDetectResults && autoDetectResults.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Found {autoDetectResults.length} assemblies from existing orders:
                </p>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {autoDetectResults.map((result, index) => (
                    <Card key={index}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{result.assembly_name}</h4>
                            <p className="text-sm text-muted-foreground">
                              {result.components_count} components, {result.created_relationships} new relationships created
                            </p>
                          </div>
                          <Badge variant="secondary">{result.components_count}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No assemblies found in existing orders.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setAutoDetectResults(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Part Detail Dialog */}
      {selectedPartId && (
        <PartDetail
          partId={selectedPartId}
          open={!!selectedPartId}
          onClose={() => setSelectedPartId(null)}
        />
      )}
    </div>
  );
}
