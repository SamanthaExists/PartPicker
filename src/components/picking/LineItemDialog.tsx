import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import type { LineItem, Tool } from '@/types';
import type { LineItemInput } from '@/hooks/useLineItems';

interface LineItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: LineItemInput) => Promise<boolean>;
  lineItem?: LineItem | null;
  isLoading?: boolean;
  tools?: Tool[];
}

export function LineItemDialog({
  open,
  onOpenChange,
  onSave,
  lineItem,
  isLoading = false,
  tools = [],
}: LineItemDialogProps) {
  const isEditMode = !!lineItem;
  const hasTools = tools.length > 0;

  const [formData, setFormData] = useState<LineItemInput>({
    part_number: '',
    description: '',
    location: '',
    qty_per_unit: 1,
    total_qty_needed: 1,
  });

  // Tool assignment state
  const [selectedToolIds, setSelectedToolIds] = useState<Set<string>>(new Set());
  const [toolQtys, setToolQtys] = useState<Record<string, number>>({});
  const [defaultQty, setDefaultQty] = useState(1);
  // Track which tools have been manually overridden
  const [manuallyOverridden, setManuallyOverridden] = useState<Set<string>>(new Set());

  const [errors, setErrors] = useState<Record<string, string>>({});

  const allToolsSelected = hasTools && selectedToolIds.size === tools.length;

  // Computed total from per-tool quantities
  const computedTotal = useMemo(() => {
    if (!hasTools) return formData.total_qty_needed;
    let total = 0;
    for (const toolId of selectedToolIds) {
      total += toolQtys[toolId] ?? defaultQty;
    }
    return total;
  }, [hasTools, selectedToolIds, toolQtys, defaultQty, formData.total_qty_needed]);

  // Reset form when dialog opens/closes or lineItem changes
  useEffect(() => {
    if (open) {
      if (lineItem) {
        setFormData({
          part_number: lineItem.part_number,
          description: lineItem.description || '',
          location: lineItem.location || '',
          qty_per_unit: lineItem.qty_per_unit,
          total_qty_needed: lineItem.total_qty_needed,
        });

        if (hasTools) {
          const editDefaultQty = lineItem.qty_per_unit;
          setDefaultQty(editDefaultQty);

          // Determine which tools are selected
          if (lineItem.tool_ids && lineItem.tool_ids.length > 0) {
            setSelectedToolIds(new Set(lineItem.tool_ids));
          } else {
            // null tool_ids = all tools
            setSelectedToolIds(new Set(tools.map(t => t.id)));
          }

          // Build per-tool qtys from overrides
          const qtys: Record<string, number> = {};
          const overridden = new Set<string>();
          for (const tool of tools) {
            if (lineItem.qty_overrides?.[tool.id] !== undefined) {
              qtys[tool.id] = lineItem.qty_overrides[tool.id];
              overridden.add(tool.id);
            } else {
              qtys[tool.id] = editDefaultQty;
            }
          }
          setToolQtys(qtys);
          setManuallyOverridden(overridden);
        }
      } else {
        setFormData({
          part_number: '',
          description: '',
          location: '',
          qty_per_unit: 1,
          total_qty_needed: hasTools ? tools.length : 1,
        });

        if (hasTools) {
          setDefaultQty(1);
          setSelectedToolIds(new Set(tools.map(t => t.id)));
          const qtys: Record<string, number> = {};
          for (const tool of tools) {
            qtys[tool.id] = 1;
          }
          setToolQtys(qtys);
          setManuallyOverridden(new Set());
        }
      }
      setErrors({});
    }
  }, [open, lineItem, hasTools, tools]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.part_number.trim()) {
      newErrors.part_number = 'Part number is required';
    }

    if (hasTools) {
      if (selectedToolIds.size === 0) {
        newErrors.tools = 'At least one tool must be selected';
      }
      if (computedTotal < 1) {
        newErrors.total = 'Total quantity must be at least 1';
      }
    } else {
      if (formData.qty_per_unit < 1) {
        newErrors.qty_per_unit = 'Quantity per unit must be at least 1';
      }
      if (formData.total_qty_needed < 1) {
        newErrors.total_qty_needed = 'Total quantity needed must be at least 1';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    let input: LineItemInput;

    if (hasTools) {
      // Compute tool_ids: null if all selected, array if subset
      const toolIds = allToolsSelected ? null : Array.from(selectedToolIds);

      // Compute qty_overrides: only entries that differ from defaultQty
      const overrides: Record<string, number> = {};
      for (const toolId of selectedToolIds) {
        const qty = toolQtys[toolId] ?? defaultQty;
        if (qty !== defaultQty) {
          overrides[toolId] = qty;
        }
      }
      const qtyOverrides = Object.keys(overrides).length > 0 ? overrides : null;

      input = {
        part_number: formData.part_number.trim(),
        description: formData.description?.trim() || null,
        location: formData.location?.trim() || null,
        qty_per_unit: defaultQty,
        total_qty_needed: computedTotal,
        tool_ids: toolIds,
        qty_overrides: qtyOverrides,
      };
    } else {
      input = {
        part_number: formData.part_number.trim(),
        description: formData.description?.trim() || null,
        location: formData.location?.trim() || null,
        qty_per_unit: formData.qty_per_unit,
        total_qty_needed: formData.total_qty_needed,
      };
    }

    const success = await onSave(input);

    if (success) {
      onOpenChange(false);
    }
  };

  const handleInputChange = (field: keyof LineItemInput, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleToggleAllTools = (checked: boolean) => {
    if (checked) {
      setSelectedToolIds(new Set(tools.map(t => t.id)));
    } else {
      setSelectedToolIds(new Set());
    }
    // Clear tools error
    if (errors.tools) {
      setErrors(prev => { const n = { ...prev }; delete n.tools; return n; });
    }
  };

  const handleToggleTool = (toolId: string, checked: boolean) => {
    setSelectedToolIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(toolId);
        // Set the qty for a newly checked tool to the default
        if (toolQtys[toolId] === undefined || toolQtys[toolId] === 0) {
          setToolQtys(q => ({ ...q, [toolId]: defaultQty }));
        }
      } else {
        next.delete(toolId);
      }
      return next;
    });
    if (errors.tools) {
      setErrors(prev => { const n = { ...prev }; delete n.tools; return n; });
    }
  };

  const handleDefaultQtyChange = (newDefault: number) => {
    const val = Math.max(0, newDefault);
    setDefaultQty(val);
    // Update all tools that haven't been manually overridden
    setToolQtys(prev => {
      const next = { ...prev };
      for (const tool of tools) {
        if (!manuallyOverridden.has(tool.id)) {
          next[tool.id] = val;
        }
      }
      return next;
    });
  };

  const handleToolQtyChange = (toolId: string, qty: number) => {
    const val = Math.max(0, qty);
    setToolQtys(prev => ({ ...prev, [toolId]: val }));
    setManuallyOverridden(prev => {
      const next = new Set(prev);
      if (val === defaultQty) {
        next.delete(toolId);
      } else {
        next.add(toolId);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Edit Line Item' : 'Add Line Item'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update the details for this line item.'
              : 'Enter the details for the new line item.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {/* Part Number */}
          <div className="space-y-2">
            <Label htmlFor="part_number">
              Part Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="part_number"
              value={formData.part_number}
              onChange={(e) => handleInputChange('part_number', e.target.value)}
              placeholder="e.g., ABC-12345"
              className={errors.part_number ? 'border-red-500' : ''}
            />
            {errors.part_number && (
              <p className="text-sm text-red-500">{errors.part_number}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description || ''}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="e.g., Hex Bolt M8x30"
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={formData.location || ''}
              onChange={(e) => handleInputChange('location', e.target.value)}
              placeholder="e.g., A-01-03"
            />
          </div>

          {/* Quantity Section */}
          {hasTools ? (
            /* Per-tool assignment UI */
            <div className="space-y-3">
              <Label>Applies to Tools</Label>

              <div className="border rounded-md divide-y">
                {/* All tools row */}
                <div className="flex items-center gap-3 px-3 min-h-[48px] bg-muted/30">
                  <Checkbox
                    checked={allToolsSelected}
                    onCheckedChange={handleToggleAllTools}
                  />
                  <span className="text-sm font-medium flex-1">All tools</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Default qty:</span>
                    <Input
                      type="number"
                      min="0"
                      value={defaultQty}
                      onChange={(e) => handleDefaultQtyChange(parseInt(e.target.value) || 0)}
                      className="w-16 h-8 text-sm text-center"
                    />
                  </div>
                </div>

                {/* Individual tool rows */}
                <div className="max-h-48 overflow-y-auto divide-y">
                  {tools.map(tool => {
                    const isSelected = selectedToolIds.has(tool.id);
                    const qty = toolQtys[tool.id] ?? defaultQty;
                    const isOverridden = manuallyOverridden.has(tool.id);

                    return (
                      <div
                        key={tool.id}
                        className="flex items-center gap-3 px-3 min-h-[48px]"
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => handleToggleTool(tool.id, checked)}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-mono">{tool.tool_number}</span>
                          {tool.tool_model && (
                            <span className="text-xs text-muted-foreground ml-2">{tool.tool_model}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">qty:</span>
                          <Input
                            type="number"
                            min="0"
                            value={qty}
                            onChange={(e) => handleToolQtyChange(tool.id, parseInt(e.target.value) || 0)}
                            disabled={!isSelected}
                            className={`w-16 h-8 text-sm text-center ${isOverridden ? 'border-blue-400' : ''}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total row */}
                <div className="flex items-center justify-between px-3 min-h-[40px] bg-muted/30">
                  <span className="text-sm font-medium">Total qty needed:</span>
                  <span className="text-sm font-bold tabular-nums w-16 text-center">{computedTotal}</span>
                </div>
              </div>

              {errors.tools && (
                <p className="text-sm text-red-500">{errors.tools}</p>
              )}
              {errors.total && (
                <p className="text-sm text-red-500">{errors.total}</p>
              )}
            </div>
          ) : (
            /* Flat quantity fields (no tools) */
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qty_per_unit">
                  Qty Per Unit <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="qty_per_unit"
                  type="number"
                  min="1"
                  value={formData.qty_per_unit}
                  onChange={(e) => handleInputChange('qty_per_unit', parseInt(e.target.value) || 1)}
                  className={errors.qty_per_unit ? 'border-red-500' : ''}
                />
                {errors.qty_per_unit && (
                  <p className="text-sm text-red-500">{errors.qty_per_unit}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="total_qty_needed">
                  Total Qty Needed <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="total_qty_needed"
                  type="number"
                  min="1"
                  value={formData.total_qty_needed}
                  onChange={(e) => handleInputChange('total_qty_needed', parseInt(e.target.value) || 1)}
                  className={errors.total_qty_needed ? 'border-red-500' : ''}
                />
                {errors.total_qty_needed && (
                  <p className="text-sm text-red-500">{errors.total_qty_needed}</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEditMode ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
