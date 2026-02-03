import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Download, Database, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { parseEnhancedExcelFile, parseCsvFile } from '@/lib/excelParser';
import { downloadImportTemplate } from '@/lib/excelTemplate';
import { useOrders } from '@/hooks/useOrders';
import { usePartsCatalog } from '@/hooks/usePartsCatalog';
import { useBOMTemplates } from '@/hooks/useBOMTemplates';
import { DuplicatePartsDialog } from '@/components/dialogs/DuplicatePartsDialog';
import { TemplateSelectDialog } from '@/components/dialogs/TemplateSelectDialog';
import type { ImportedOrder, PartConflict, BOMTemplateWithItems } from '@/types';

export function Import() {
  const navigate = useNavigate();
  const { importOrder } = useOrders();
  const {
    parts: catalogParts,
    checkForConflicts,
    applyConflictResolutions,
    savePartsFromImport
  } = usePartsCatalog();
  const [isDragging, setIsDragging] = useState(false);
  const [parseResult, setParseResult] = useState<{
    order: ImportedOrder;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [conflicts, setConflicts] = useState<PartConflict[]>([]);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [saveToCatalog, setSaveToCatalog] = useState(true);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const { templates } = useBOMTemplates();

  const handleFile = async (file: File) => {
    setParseResult(null);
    setParseErrors([]);
    setConflicts([]);

    const isExcel =
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls') ||
      file.type.includes('spreadsheet');
    const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv';

    if (!isExcel && !isCsv) {
      setParseErrors(['Please upload an Excel (.xlsx) or CSV file']);
      return;
    }

    const result = isExcel
      ? await parseEnhancedExcelFile(file)
      : await parseCsvFile(file);

    if (result.success && result.order) {
      setParseResult({
        order: result.order,
        errors: result.errors,
        warnings: result.warnings,
      });

      // Check for conflicts with parts catalog
      if (catalogParts.length > 0) {
        const foundConflicts = checkForConflicts(result.order.line_items);
        if (foundConflicts.length > 0) {
          setConflicts(foundConflicts);
          setShowConflictDialog(true);
        }
      }
    } else {
      setParseErrors(result.errors);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleImport = async () => {
    if (!parseResult?.order) return;

    setIsImporting(true);

    // Apply any conflict resolutions first
    if (conflicts.length > 0) {
      await applyConflictResolutions(conflicts);
    }

    // Save parts to catalog if enabled
    if (saveToCatalog) {
      await savePartsFromImport(parseResult.order.line_items, true);
    }

    const result = await importOrder(parseResult.order);
    setIsImporting(false);

    if (result) {
      navigate(`/orders/${result.id}`);
    }
  };

  const handleConflictResolve = (resolvedConflicts: PartConflict[]) => {
    setConflicts(resolvedConflicts);
    setShowConflictDialog(false);
  };

  const handleTemplateSelect = (template: BOMTemplateWithItems) => {
    // Create an imported order from the template
    const order: ImportedOrder = {
      so_number: '', // Will be filled in by user
      tools: [{ tool_number: '1', tool_model: template.tool_model || undefined }],
      line_items: template.items.map(item => ({
        part_number: item.part_number,
        description: item.description || undefined,
        location: item.location || undefined,
        qty_per_unit: item.qty_per_unit,
        total_qty_needed: item.qty_per_unit,
      })),
    };

    setParseResult({
      order,
      errors: [],
      warnings: ['Template loaded. You may need to adjust SO number and tool quantities.'],
    });

    // Check for conflicts
    if (catalogParts.length > 0) {
      const foundConflicts = checkForConflicts(order.line_items);
      if (foundConflicts.length > 0) {
        setConflicts(foundConflicts);
      }
    }
  };

  const clearResult = () => {
    setParseResult(null);
    setParseErrors([]);
    setConflicts([]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Import Order</h1>
        <p className="text-muted-foreground">
          Upload an Excel or CSV file to import a sales order
        </p>
      </div>

      {/* Drop Zone */}
      {!parseResult && (
        <Card>
          <CardContent className="pt-6">
            <div
              className={`
                border-2 border-dashed rounded-lg p-12 text-center transition-colors
                ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
              `}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">
                Drag and drop your file here
              </p>
              <p className="text-muted-foreground mb-4">
                Supports Excel (.xlsx) and CSV files
              </p>
              <div className="flex items-center gap-2 justify-center">
                <label htmlFor="file-upload">
                  <Button asChild>
                    <span>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Browse Files
                    </span>
                  </Button>
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInput}
                  className="hidden"
                />
                {templates.length > 0 && (
                  <Button variant="outline" onClick={() => setShowTemplateDialog(true)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Use Template
                  </Button>
                )}
              </div>
            </div>

            {/* Parse Errors */}
            {parseErrors.length > 0 && (
              <div className="mt-4 p-4 bg-destructive/10 rounded-lg">
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">Import Failed</span>
                </div>
                <ul className="list-disc list-inside text-sm">
                  {parseErrors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {parseResult && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              Preview: SO-{parseResult.order.so_number}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={clearResult}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Warnings */}
            {parseResult.warnings.length > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-950/20 dark:border-yellow-800">
                <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Warnings</p>
                <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300">
                  {parseResult.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Order Info */}
            <div>
              <h3 className="font-medium mb-2">Order Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">SO Number:</span>
                  <span className="ml-2 font-medium">
                    {parseResult.order.so_number}
                  </span>
                </div>
                {parseResult.order.po_number && (
                  <div>
                    <span className="text-muted-foreground">PO Number:</span>
                    <span className="ml-2 font-medium">
                      {parseResult.order.po_number}
                    </span>
                  </div>
                )}
                {parseResult.order.customer_name && (
                  <div>
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="ml-2 font-medium">
                      {parseResult.order.customer_name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Tools */}
            <div>
              <h3 className="font-medium mb-2">
                Tools ({parseResult.order.tools.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {parseResult.order.tools.map((tool, i) => (
                  <Badge key={i} variant="secondary">
                    {tool.tool_number}
                    {tool.tool_model && ` [${tool.tool_model}]`}
                    {tool.serial_number && ` (SN: ${tool.serial_number})`}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Conflicts Warning */}
            {conflicts.length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-950/20 dark:border-amber-800">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 mb-2">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">{conflicts.length} Part Conflict(s) Detected</span>
                </div>
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
                  Some parts have different descriptions than what's in your catalog.
                </p>
                <Button size="sm" variant="outline" onClick={() => setShowConflictDialog(true)}>
                  Review Conflicts
                </Button>
              </div>
            )}

            {/* Line Items */}
            <div>
              <h3 className="font-medium mb-2">
                Line Items ({parseResult.order.line_items.length})
              </h3>
              <div className="max-h-64 overflow-auto border rounded-lg">
                <table className="w-full text-sm min-w-[500px]">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2 whitespace-nowrap">Part Number</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-left p-2 whitespace-nowrap">Location</th>
                      <th className="text-center p-2 whitespace-nowrap">Qty/Unit</th>
                      <th className="text-center p-2 whitespace-nowrap">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.order.line_items.slice(0, 50).map((item, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 font-mono whitespace-nowrap">{item.part_number}</td>
                        <td className="p-2 text-muted-foreground max-w-[200px] truncate">
                          {item.description || '-'}
                        </td>
                        <td className="p-2 whitespace-nowrap">{item.location || '-'}</td>
                        <td className="p-2 text-center">{item.qty_per_unit}</td>
                        <td className="p-2 text-center">{item.total_qty_needed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parseResult.order.line_items.length > 50 && (
                  <p className="p-2 text-center text-muted-foreground">
                    ...and {parseResult.order.line_items.length - 50} more items
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 sm:hidden">
                ← Scroll horizontally to see all columns →
              </p>
            </div>

            {/* Options */}
            <div className="flex items-center gap-4 pt-4 border-t">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToCatalog}
                  onChange={(e) => setSaveToCatalog(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Database className="h-4 w-4 text-muted-foreground" />
                <span>Save parts to catalog</span>
              </label>
              {catalogParts.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({catalogParts.length} parts in catalog)
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={clearResult}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? 'Importing...' : 'Import Order'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template Download */}
      <Card>
        <CardHeader>
          <CardTitle>Download Template</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Download an Excel template to get started. Choose the format that fits your order:
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadImportTemplate('single')}>
              <Download className="mr-2 h-4 w-4" />
              Single Tool Type
            </Button>
            <Button variant="outline" onClick={() => downloadImportTemplate('multi')}>
              <Download className="mr-2 h-4 w-4" />
              Multiple Tool Types
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <strong>Single Tool Type:</strong> All tools share the same parts list (e.g., 5x identical 230Q units).
            <br />
            <strong>Multiple Tool Types:</strong> Different tools have different BOMs (e.g., 2x 230Q + 1x 450Q).
          </p>
        </CardContent>
      </Card>

      {/* Help */}
      <Card>
        <CardHeader>
          <CardTitle>File Format Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <h4 className="font-medium mb-1">Single Tool Type (Simple Format)</h4>
            <p className="text-muted-foreground">
              Excel file with "Order Info" sheet containing SO Number, PO Number, Customer, Tool Qty, Tool Model.
              "Parts" sheet with Part Number, Description, Location, Qty/Unit columns.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Multiple Tool Types (Advanced Format)</h4>
            <p className="text-muted-foreground">
              "Order Info" sheet for header info, then separate sheets for each tool type (e.g., "230Q", "450Q").
              Each tool type sheet has its own parts list with a Qty column for number of tools of that type.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Legacy Format</h4>
            <p className="text-muted-foreground">
              Single sheet with tool columns (e.g., "3137-1", "3137-2") for each tool's quantities.
              The importer auto-detects this format and creates tools accordingly.
            </p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Expected Columns</h4>
            <ul className="list-disc list-inside text-muted-foreground">
              <li>Part Number (required)</li>
              <li>Description (optional)</li>
              <li>Location/Bin (optional)</li>
              <li>Quantity per unit or tool-specific quantities</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Duplicate Parts Dialog */}
      <DuplicatePartsDialog
        open={showConflictDialog}
        onOpenChange={setShowConflictDialog}
        conflicts={conflicts}
        onResolve={handleConflictResolve}
      />

      {/* Template Select Dialog */}
      <TemplateSelectDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        onSelect={handleTemplateSelect}
      />
    </div>
  );
}
