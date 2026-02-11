import React, { useState, useMemo, useCallback } from 'react';
import { FileText, Plus, ArrowLeft, Pencil, Trash2, Search, Loader2, ListChecks, Package, Puzzle, Filter, X, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchInput } from '@/components/common/SearchInput';
import { ClassificationBadge } from '@/components/parts/ClassificationBadge';
import { ExplodedBOMDialog } from '@/components/parts/ExplodedBOMDialog';
import { useBOMTemplates } from '@/hooks/useBOMTemplates';
import { usePartClassifications } from '@/hooks/usePartClassifications';
import type { BOMTemplate, BOMTemplateItem, BOMTemplateWithItems } from '@/types';

interface AssemblyGroup {
  name: string;
  key: string; // '__all__' = All, '__unassigned__' = loose parts, or assembly name
  count: number;
}

export function Templates() {
  const {
    templates,
    loading,
    error,
    refresh,
    getTemplateWithItems,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    addTemplateItem,
    updateTemplateItem,
    deleteTemplateItem,
    extractTemplatesFromOrders,
  } = useBOMTemplates();

  // View state
  const [selectedTemplate, setSelectedTemplate] = useState<BOMTemplateWithItems | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'bom' | 'assembly'>('all');

  // Assembly navigation
  const [selectedAssemblyFilter, setSelectedAssemblyFilter] = useState<string | null>(null);
  const [templateItemSearch, setTemplateItemSearch] = useState('');

  // Template dialog
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BOMTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', tool_model: '', template_type: 'bom' as 'bom' | 'assembly' });

  // Item dialog
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<BOMTemplateItem | null>(null);
  const [itemForm, setItemForm] = useState({
    part_number: '',
    description: '',
    location: '',
    assembly_group: '',
    qty_per_unit: 1,
  });

  // Delete confirmation
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'template' | 'item'; id: string; name: string } | null>(null);

  // Extract dialog
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  // BOM dialog
  const [bomDialogOpen, setBomDialogOpen] = useState(false);
  const [bomDialogPart, setBomDialogPart] = useState<{ id: string; partNumber: string; description?: string | null }>({ id: '', partNumber: '' });

  // Fetch part classifications for the selected template
  const partNumbers = useMemo(() => {
    if (!selectedTemplate) return [];
    return selectedTemplate.items.map(item => item.part_number);
  }, [selectedTemplate]);
  const { partsMap, loading: partsLoading } = usePartClassifications(partNumbers);

  // Unique tool models for filter dropdown
  const uniqueModels = useMemo(() => {
    const models = new Set<string>();
    for (const t of templates) {
      if (t.tool_model) models.add(t.tool_model);
    }
    return Array.from(models).sort();
  }, [templates]);

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      const matchesSearch =
        !search ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.tool_model && t.tool_model.toLowerCase().includes(search.toLowerCase()));
      const matchesModel = modelFilter === 'all' || t.tool_model === modelFilter;
      const matchesType = typeFilter === 'all' || t.template_type === typeFilter;
      return matchesSearch && matchesModel && matchesType;
    });
  }, [templates, search, modelFilter, typeFilter]);

  // Stats
  const stats = useMemo(() => {
    const models = new Set(templates.map(t => t.tool_model).filter(Boolean));
    const bomCount = templates.filter(t => t.template_type === 'bom' || !t.template_type).length;
    const assemblyCount = templates.filter(t => t.template_type === 'assembly').length;
    return {
      total: templates.length,
      toolModels: models.size,
      bomCount,
      assemblyCount,
    };
  }, [templates]);

  // --- Assembly navigation computed values ---

  const assemblyGroups = useMemo((): AssemblyGroup[] => {
    if (!selectedTemplate) return [];
    const groups = new Map<string, number>();
    let unassignedCount = 0;

    for (const item of selectedTemplate.items) {
      if (item.assembly_group) {
        groups.set(item.assembly_group, (groups.get(item.assembly_group) || 0) + 1);
      } else {
        unassignedCount++;
      }
    }

    const result: AssemblyGroup[] = Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, key: name, count }));

    if (unassignedCount > 0) {
      result.push({ name: 'Loose Parts', key: '__unassigned__', count: unassignedCount });
    }

    return result;
  }, [selectedTemplate]);

  const hasMultipleAssemblies = assemblyGroups.length > 1;

  const activeFilterName = useMemo(() => {
    if (selectedAssemblyFilter === null) return 'All Items';
    if (selectedAssemblyFilter === '__unassigned__') return 'Loose Parts';
    return selectedAssemblyFilter;
  }, [selectedAssemblyFilter]);

  const filteredTemplateItems = useMemo((): BOMTemplateItem[] => {
    if (!selectedTemplate) return [];
    let items = selectedTemplate.items;

    // Filter by assembly
    if (selectedAssemblyFilter !== null) {
      if (selectedAssemblyFilter === '__unassigned__') {
        items = items.filter(i => !i.assembly_group);
      } else {
        items = items.filter(i => i.assembly_group === selectedAssemblyFilter);
      }
    }

    // Filter by search
    if (templateItemSearch.trim()) {
      const q = templateItemSearch.toLowerCase().trim();
      items = items.filter(i =>
        i.part_number.toLowerCase().includes(q) ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.location && i.location.toLowerCase().includes(q))
      );
    }

    return items;
  }, [selectedTemplate, selectedAssemblyFilter, templateItemSearch]);

  const sortedFilteredItems = useMemo((): BOMTemplateItem[] => {
    const items = [...filteredTemplateItems];

    // When showing "All Items" with multiple assemblies, sort by assembly_group for group headers
    if (selectedAssemblyFilter === null && hasMultipleAssemblies) {
      items.sort((a, b) => {
        const aGroup = a.assembly_group || '';
        const bGroup = b.assembly_group || '';
        if (!aGroup && bGroup) return 1;
        if (aGroup && !bGroup) return -1;
        return aGroup.localeCompare(bGroup);
      });
    }

    return items;
  }, [filteredTemplateItems, selectedAssemblyFilter, hasMultipleAssemblies]);

  const shouldShowAssemblyHeader = useCallback((index: number): boolean => {
    if (index === 0) return true;
    const item = sortedFilteredItems[index];
    const prevItem = sortedFilteredItems[index - 1];
    return (item.assembly_group || '') !== (prevItem.assembly_group || '');
  }, [sortedFilteredItems]);

  const getAssemblyGroupCount = useCallback((assemblyGroup: string | null): number => {
    if (!selectedTemplate) return 0;
    const group = assemblyGroup || '';
    return selectedTemplate.items.filter(i => (i.assembly_group || '') === group).length;
  }, [selectedTemplate]);

  // Load template detail
  const handleSelectTemplate = async (template: BOMTemplate) => {
    setLoadingDetail(true);
    const detail = await getTemplateWithItems(template.id);
    setSelectedTemplate(detail);
    setSelectedAssemblyFilter(null);
    setTemplateItemSearch('');
    setLoadingDetail(false);
  };

  // Refresh detail if selected template changes
  const refreshDetail = async () => {
    if (selectedTemplate) {
      const detail = await getTemplateWithItems(selectedTemplate.id);
      setSelectedTemplate(detail);
    }
  };

  // Template CRUD
  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({ name: '', tool_model: '', template_type: 'bom' });
    setShowTemplateDialog(true);
  };

  const openEditTemplate = (t: BOMTemplate) => {
    setEditingTemplate(t);
    setTemplateForm({ name: t.name, tool_model: t.tool_model || '', template_type: t.template_type || 'bom' });
    setShowTemplateDialog(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) return;

    if (editingTemplate) {
      await updateTemplate(editingTemplate.id, {
        name: templateForm.name.trim(),
        tool_model: templateForm.tool_model.trim() || null,
      });
      // Refresh detail if we're editing the selected template
      if (selectedTemplate?.id === editingTemplate.id) {
        const detail = await getTemplateWithItems(editingTemplate.id);
        setSelectedTemplate(detail);
      }
    } else {
      await createTemplate(
        templateForm.name.trim(),
        templateForm.tool_model.trim() || undefined,
        templateForm.template_type
      );
    }

    setShowTemplateDialog(false);
  };

  const confirmDeleteTemplate = (t: BOMTemplate) => {
    setDeleteTarget({ type: 'template', id: t.id, name: t.name });
    setShowDeleteDialog(true);
  };

  const confirmDeleteItem = (item: BOMTemplateItem) => {
    setDeleteTarget({ type: 'item', id: item.id, name: item.part_number });
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'template') {
      await deleteTemplate(deleteTarget.id);
      if (selectedTemplate?.id === deleteTarget.id) {
        setSelectedTemplate(null);
      }
    } else {
      await deleteTemplateItem(deleteTarget.id);
      await refreshDetail();
    }

    setShowDeleteDialog(false);
    setDeleteTarget(null);
  };

  // Item CRUD
  const openAddItem = () => {
    setEditingItem(null);
    // Pre-fill assembly_group from current filter
    let prefillAssembly = '';
    if (selectedAssemblyFilter && selectedAssemblyFilter !== '__unassigned__') {
      prefillAssembly = selectedAssemblyFilter;
    }
    setItemForm({ part_number: '', description: '', location: '', assembly_group: prefillAssembly, qty_per_unit: 1 });
    setShowItemDialog(true);
  };

  const openEditItem = (item: BOMTemplateItem) => {
    setEditingItem(item);
    setItemForm({
      part_number: item.part_number,
      description: item.description || '',
      location: item.location || '',
      assembly_group: item.assembly_group || '',
      qty_per_unit: item.qty_per_unit,
    });
    setShowItemDialog(true);
  };

  const handleSaveItem = async () => {
    if (!selectedTemplate || !itemForm.part_number.trim()) return;

    if (editingItem) {
      await updateTemplateItem(editingItem.id, {
        part_number: itemForm.part_number.trim(),
        description: itemForm.description.trim() || null,
        location: itemForm.location.trim() || null,
        assembly_group: itemForm.assembly_group.trim() || null,
        qty_per_unit: itemForm.qty_per_unit,
      });
    } else {
      await addTemplateItem(selectedTemplate.id, {
        part_number: itemForm.part_number.trim(),
        description: itemForm.description.trim() || null,
        location: itemForm.location.trim() || null,
        assembly_group: itemForm.assembly_group.trim() || null,
        qty_per_unit: itemForm.qty_per_unit,
      });
    }

    setShowItemDialog(false);
    await refreshDetail();
  };

  // Extract from orders
  const handleExtract = async () => {
    setExtracting(true);
    setExtractResult(null);
    const result = await extractTemplatesFromOrders();
    setExtractResult(result);
    setExtracting(false);
  };

  // View BOM for assembly part
  const handleViewBOM = (partNumber: string) => {
    const part = partsMap.get(partNumber);
    if (part && part.classification_type === 'assembly') {
      setBomDialogPart({ id: part.id, partNumber: part.part_number, description: part.description });
      setBomDialogOpen(true);
    }
  };

  // Detail view
  if (selectedTemplate) {
    const showAssemblyColumn = selectedAssemblyFilter === null || !hasMultipleAssemblies;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedTemplate(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold">{selectedTemplate.name}</h1>
              {selectedTemplate.template_type === 'assembly' ? (
                <Badge className="bg-purple-600 hover:bg-purple-700 text-white">Assembly</Badge>
              ) : (
                <Badge variant="outline">BOM</Badge>
              )}
              {selectedTemplate.tool_model && (
                <Badge variant="secondary">{selectedTemplate.tool_model}</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {selectedTemplate.items.length} items
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => openEditTemplate(selectedTemplate)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>

        {/* Assembly Overview Cards (only when 2+ assembly groups) */}
        {hasMultipleAssemblies && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {/* All Items Card */}
            <Card
              className={`cursor-pointer transition-all hover:bg-accent/50 ${
                selectedAssemblyFilter === null ? 'ring-2 ring-primary shadow-sm' : ''
              }`}
              onClick={() => setSelectedAssemblyFilter(null)}
            >
              <CardContent className="flex flex-col items-center p-4 text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
                  <ListChecks className="h-5 w-5" />
                </div>
                <div className="font-medium text-sm">All Items</div>
                <Badge variant="default" className="mt-1">{selectedTemplate.items.length}</Badge>
              </CardContent>
            </Card>

            {/* Assembly Group Cards */}
            {assemblyGroups.map(group => (
              <Card
                key={group.key}
                className={`cursor-pointer transition-all hover:bg-accent/50 ${
                  selectedAssemblyFilter === group.key ? 'ring-2 ring-purple-500 shadow-sm' : ''
                }`}
                onClick={() => setSelectedAssemblyFilter(group.key)}
              >
                <CardContent className="flex flex-col items-center p-4 text-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                    group.key === '__unassigned__'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-purple-100 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400'
                  }`}>
                    {group.key === '__unassigned__'
                      ? <Puzzle className="h-5 w-5" />
                      : <Package className="h-5 w-5" />
                    }
                  </div>
                  <div className="font-medium text-sm truncate w-full">{group.name}</div>
                  <Badge
                    className={`mt-1 ${
                      group.key === '__unassigned__'
                        ? ''
                        : 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700'
                    }`}
                    variant={group.key === '__unassigned__' ? 'secondary' : 'default'}
                  >
                    {group.count}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Assembly Tab Bar (only when 2+ assembly groups) */}
        {hasMultipleAssemblies && (
          <div className="overflow-x-auto scrollbar-hide">
            <div className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground w-auto min-w-full sm:min-w-0">
              <button
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all ${
                  selectedAssemblyFilter === null
                    ? 'bg-background text-foreground shadow-sm'
                    : 'hover:bg-background/50'
                }`}
                onClick={() => setSelectedAssemblyFilter(null)}
              >
                All Items
                <Badge variant={selectedAssemblyFilter === null ? 'default' : 'secondary'} className="ml-1.5 h-5 px-1.5 text-xs">
                  {selectedTemplate.items.length}
                </Badge>
              </button>
              {assemblyGroups.map(group => (
                <button
                  key={group.key}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all ${
                    selectedAssemblyFilter === group.key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'hover:bg-background/50'
                  }`}
                  onClick={() => setSelectedAssemblyFilter(group.key)}
                >
                  {group.name}
                  <Badge
                    className={`ml-1.5 h-5 px-1.5 text-xs ${
                      selectedAssemblyFilter === group.key && group.key !== '__unassigned__'
                        ? 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-600'
                        : ''
                    }`}
                    variant={selectedAssemblyFilter === group.key && group.key !== '__unassigned__' ? 'default' : 'secondary'}
                  >
                    {group.count}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active Filter Indicator */}
        {hasMultipleAssemblies && selectedAssemblyFilter !== null && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50 text-sm">
            <Filter className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
            <span>
              Showing <strong>{activeFilterName}</strong>
              <span className="text-muted-foreground ml-1">({filteredTemplateItems.length} items)</span>
            </span>
            <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => setSelectedAssemblyFilter(null)}>
              <X className="h-3.5 w-3.5 mr-1" />
              Show All
            </Button>
          </div>
        )}

        {/* Items Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex-shrink-0">Template Items</CardTitle>
            <div className="flex items-center gap-2">
              {selectedTemplate.items.length > 0 && (
                <div className="relative max-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 pr-8 text-sm"
                    placeholder="Search items..."
                    value={templateItemSearch}
                    onChange={e => setTemplateItemSearch(e.target.value)}
                  />
                  {templateItemSearch && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setTemplateItemSearch('')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              <Button size="sm" onClick={openAddItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Empty: no items in template at all */}
            {selectedTemplate.items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No items yet. Add parts to this template.</p>
              </div>
            ) : filteredTemplateItems.length === 0 ? (
              /* Empty: items exist but filter/search yields nothing */
              <div className="text-center py-8 text-muted-foreground">
                <Filter className="h-12 w-12 mx-auto mb-3 opacity-50" />
                {templateItemSearch ? (
                  <p>No items match "{templateItemSearch}" in this view.</p>
                ) : (
                  <p>No items in this assembly.</p>
                )}
                {selectedAssemblyFilter !== null && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setSelectedAssemblyFilter(null)}>
                    Show All Items
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-auto border rounded-lg">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2 whitespace-nowrap">Part Number</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-left p-2 whitespace-nowrap">Location</th>
                      {showAssemblyColumn && (
                        <th className="text-left p-2 whitespace-nowrap">Assembly Group</th>
                      )}
                      <th className="text-center p-2 whitespace-nowrap">Qty/Unit</th>
                      <th className="text-right p-2 whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFilteredItems.map((item, idx) => (
                      <React.Fragment key={item.id}>
                        {/* Assembly Group Header Row (All Items view with multiple assemblies) */}
                        {selectedAssemblyFilter === null && hasMultipleAssemblies && shouldShowAssemblyHeader(idx) && (
                          <tr>
                            <td
                              colSpan={showAssemblyColumn ? 6 : 5}
                              className="py-2 px-3 border-l-[3px] border-l-purple-600 bg-purple-50 dark:bg-purple-950/20"
                            >
                              <div className="flex items-center gap-2">
                                {item.assembly_group ? (
                                  <Package className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                ) : (
                                  <Puzzle className="h-4 w-4 text-muted-foreground" />
                                )}
                                <strong className="text-sm">{item.assembly_group || 'Loose Parts'}</strong>
                                <Badge variant="secondary" className="text-xs">
                                  {getAssemblyGroupCount(item.assembly_group)} parts
                                </Badge>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Item Row */}
                        <tr className="border-t">
                          <td className="p-2 font-mono whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {item.part_number}
                              {(() => {
                                const part = partsMap.get(item.part_number);
                                return part ? <ClassificationBadge classification={part.classification_type} /> : null;
                              })()}
                            </div>
                          </td>
                          <td className="p-2 text-muted-foreground max-w-[200px] truncate">
                            {item.description || '-'}
                          </td>
                          <td className="p-2 whitespace-nowrap">{item.location || '-'}</td>
                          {showAssemblyColumn && (
                            <td className="p-2 whitespace-nowrap text-xs font-mono text-muted-foreground">
                              {item.assembly_group || '-'}
                            </td>
                          )}
                          <td className="p-2 text-center">{item.qty_per_unit}</td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              {(() => {
                                const part = partsMap.get(item.part_number);
                                return part?.classification_type === 'assembly' ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleViewBOM(item.part_number)}
                                    title="View BOM"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null;
                              })()}
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditItem(item)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => confirmDeleteItem(item)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Item Dialog */}
        <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Item' : 'Add Item'}</DialogTitle>
              <DialogDescription>
                {editingItem ? 'Update the template item details.' : 'Add a new part to this template.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="item-part">Part Number *</Label>
                <Input
                  id="item-part"
                  value={itemForm.part_number}
                  onChange={e => setItemForm(f => ({ ...f, part_number: e.target.value }))}
                  placeholder="e.g., 12345-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-desc">Description</Label>
                <Input
                  id="item-desc"
                  value={itemForm.description}
                  onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Part description"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="item-loc">Location</Label>
                  <Input
                    id="item-loc"
                    value={itemForm.location}
                    onChange={e => setItemForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="e.g., A-1-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-qty">Qty per Unit</Label>
                  <Input
                    id="item-qty"
                    type="number"
                    min="1"
                    value={itemForm.qty_per_unit}
                    onChange={e => setItemForm(f => ({ ...f, qty_per_unit: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-assy">Assembly Group</Label>
                <Input
                  id="item-assy"
                  value={itemForm.assembly_group}
                  onChange={e => setItemForm(f => ({ ...f, assembly_group: e.target.value }))}
                  placeholder="e.g., Main Frame"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowItemDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveItem} disabled={!itemForm.part_number.trim()}>
                {editingItem ? 'Save Changes' : 'Add Item'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Template Edit Dialog (reused) */}
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tpl-name">Template Name *</Label>
                <Input
                  id="tpl-name"
                  value={templateForm.name}
                  onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., 230Q BOM"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tpl-model">Tool Model</Label>
                <Input
                  id="tpl-model"
                  value={templateForm.tool_model}
                  onChange={e => setTemplateForm(f => ({ ...f, tool_model: e.target.value }))}
                  placeholder="e.g., 230Q"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>Cancel</Button>
              <Button onClick={handleSaveTemplate} disabled={!templateForm.name.trim()}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {deleteTarget?.type === 'template' ? 'Template' : 'Item'}</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{deleteTarget?.name}"?
                {deleteTarget?.type === 'template' && ' This will also delete all items in this template.'}
                {' '}This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Templates</h1>
          <p className="text-muted-foreground">Manage BOM templates for quick order creation</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setExtractResult(null); setShowExtractDialog(true); }}>
            <Search className="h-4 w-4 mr-2" />
            Extract from Orders
          </Button>
          <Button onClick={openCreateTemplate}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Templates</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.bomCount}</div>
            <div className="text-sm text-muted-foreground">BOM Templates</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.assemblyCount}</div>
            <div className="text-sm text-muted-foreground">Assembly Templates</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.toolModels}</div>
            <div className="text-sm text-muted-foreground">Tool Models</div>
          </CardContent>
        </Card>
      </div>

      {/* Type Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        <div className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground">
          <button
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all ${
              typeFilter === 'all'
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:bg-background/50'
            }`}
            onClick={() => setTypeFilter('all')}
          >
            All
            <Badge variant={typeFilter === 'all' ? 'default' : 'secondary'} className="ml-1.5 h-5 px-1.5 text-xs">
              {stats.total}
            </Badge>
          </button>
          <button
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all ${
              typeFilter === 'bom'
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:bg-background/50'
            }`}
            onClick={() => setTypeFilter('bom')}
          >
            BOM Templates
            <Badge variant={typeFilter === 'bom' ? 'default' : 'secondary'} className="ml-1.5 h-5 px-1.5 text-xs">
              {stats.bomCount}
            </Badge>
          </button>
          <button
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all ${
              typeFilter === 'assembly'
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:bg-background/50'
            }`}
            onClick={() => setTypeFilter('assembly')}
          >
            Assembly Templates
            <Badge
              className={`ml-1.5 h-5 px-1.5 text-xs ${
                typeFilter === 'assembly' ? 'bg-purple-600 hover:bg-purple-700' : ''
              }`}
              variant={typeFilter === 'assembly' ? 'default' : 'secondary'}
            >
              {stats.assemblyCount}
            </Badge>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search templates..."
          className="flex-1"
        />
        <Select value={modelFilter} onValueChange={setModelFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="All Models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {uniqueModels.map(model => (
              <SelectItem key={model} value={model}>{model}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-destructive/10 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Templates List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {templates.length === 0
                ? 'No templates yet. Create one or extract from existing orders.'
                : 'No templates match your search.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredTemplates.map(template => (
            <Card
              key={template.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => handleSelectTemplate(template)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{template.name}</span>
                      {template.template_type === 'assembly' ? (
                        <Badge className="flex-shrink-0 bg-purple-600 hover:bg-purple-700 text-white">Assembly</Badge>
                      ) : (
                        <Badge variant="outline" className="flex-shrink-0">BOM</Badge>
                      )}
                      {template.tool_model && (
                        <Badge variant="secondary" className="flex-shrink-0">{template.tool_model}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(template.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={e => { e.stopPropagation(); openEditTemplate(template); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={e => { e.stopPropagation(); confirmDeleteTemplate(template); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? 'Update the template details.' : 'Create a new BOM template.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tpl-name2">Template Name *</Label>
              <Input
                id="tpl-name2"
                value={templateForm.name}
                onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g., 230Q BOM"
              />
            </div>
            <div className="space-y-2">
              <Label>Template Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="template-type"
                    value="bom"
                    checked={templateForm.template_type === 'bom'}
                    onChange={e => setTemplateForm(f => ({ ...f, template_type: 'bom' }))}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">BOM (Bill of Materials)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="template-type"
                    value="assembly"
                    checked={templateForm.template_type === 'assembly'}
                    onChange={e => setTemplateForm(f => ({ ...f, template_type: 'assembly' }))}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Assembly</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {templateForm.template_type === 'bom'
                  ? 'Full bill of materials for a complete tool/product'
                  : 'Component assembly template (e.g., Main Frame, Motor Assembly)'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-model2">Tool Model</Label>
              <Input
                id="tpl-model2"
                value={templateForm.tool_model}
                onChange={e => setTemplateForm(f => ({ ...f, tool_model: e.target.value }))}
                placeholder="e.g., 230Q"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={!templateForm.name.trim()}>
              {editingTemplate ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This will also delete all items in this template. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extract from Orders Dialog */}
      <Dialog open={showExtractDialog} onOpenChange={setShowExtractDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extract Templates from Orders</DialogTitle>
            <DialogDescription>
              Scan all existing orders and create templates for each unique BOM. Duplicate BOMs (same parts and quantities) will be merged into a single template.
            </DialogDescription>
          </DialogHeader>

          {extractResult ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg text-center">
                  <div className="text-xl font-bold text-green-700 dark:text-green-400">{extractResult.created}</div>
                  <div className="text-xs text-muted-foreground">Created</div>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <div className="text-xl font-bold">{extractResult.skipped}</div>
                  <div className="text-xs text-muted-foreground">Skipped (duplicates)</div>
                </div>
              </div>
              {extractResult.errors.length > 0 && (
                <div className="p-3 bg-destructive/10 rounded-lg text-sm text-destructive">
                  <p className="font-medium mb-1">Errors:</p>
                  <ul className="list-disc list-inside">
                    {extractResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            extracting && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                <span>Extracting templates...</span>
              </div>
            )
          )}

          <DialogFooter>
            {extractResult ? (
              <Button onClick={() => setShowExtractDialog(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowExtractDialog(false)} disabled={extracting}>Cancel</Button>
                <Button onClick={handleExtract} disabled={extracting}>
                  {extracting ? 'Extracting...' : 'Extract'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BOM Dialog */}
      <ExplodedBOMDialog
        open={bomDialogOpen}
        onOpenChange={setBomDialogOpen}
        partId={bomDialogPart.id}
        partNumber={bomDialogPart.partNumber}
        partDescription={bomDialogPart.description}
      />

      {/* Loading detail overlay */}
      {loadingDetail && (
        <div className="fixed inset-0 bg-background/50 z-50 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
    </div>
  );
}
