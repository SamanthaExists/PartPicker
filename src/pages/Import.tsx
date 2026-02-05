import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Download, Database, FileText, Trash2, Files } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { parseEnhancedExcelFile, parseCsvFile } from '@/lib/excelParser';
import { parseBOMCsv, mergeMultipleBOMs, buildImportedOrder } from '@/lib/bomParser';
import type { ParsedBOM, ToolMapping, MergedBOMResult } from '@/lib/bomParser';
import { downloadImportTemplate } from '@/lib/excelTemplate';
import { useOrders } from '@/hooks/useOrders';
import { usePartsCatalog } from '@/hooks/usePartsCatalog';
import { useBOMTemplates } from '@/hooks/useBOMTemplates';
import { useActivityLog } from '@/hooks/useActivityLog';
import { useSettings } from '@/hooks/useSettings';
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
  const { templates, autoExtractTemplate, autoExtractAssemblyTemplates } = useBOMTemplates();
  const { logActivity } = useActivityLog();
  const { getUserName } = useSettings();

  // Multi-BOM state
  const [bomFiles, setBomFiles] = useState<{ file: File; toolModel: string; toolNumber: string }[]>([]);
  const [bomOrderInfo, setBomOrderInfo] = useState({
    soNumber: '',
    poNumber: '',
    customerName: '',
    purchaseDate: '',
    dueDate: '',
    estimatedShipDate: '',
  });
  const [bomParseResult, setBomParseResult] = useState<{
    merged: MergedBOMResult;
    order: ImportedOrder;
    warnings: string[];
  } | null>(null);
  const [bomParseErrors, setBomParseErrors] = useState<string[]>([]);
  const [isBomDragging, setIsBomDragging] = useState(false);

  // --- Standard Import Handlers ---

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
      const partCount = parseResult.order.line_items.length;
      const toolCount = parseResult.order.tools.length;
      const toolNumbers = parseResult.order.tools.map(t => t.tool_number);
      logActivity({
        type: 'order_imported',
        order_id: result.id,
        so_number: parseResult.order.so_number,
        description: `Order SO-${parseResult.order.so_number} imported with ${partCount} parts and ${toolCount} tools`,
        performed_by: getUserName(),
        details: {
          part_count: partCount,
          tool_count: toolCount,
          tool_numbers: toolNumbers,
        },
      });

      // Auto-extract BOM template
      const toolModel = parseResult.order.tools[0]?.tool_model || null;
      await autoExtractTemplate(parseResult.order.line_items, toolModel, parseResult.order.so_number);

      // Auto-extract assembly templates
      await autoExtractAssemblyTemplates(parseResult.order.line_items);

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

  // --- Multi-BOM Handlers ---

  const handleBomFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsBomDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(
      f => f.name.endsWith('.csv') || f.type === 'text/csv'
    );

    if (files.length === 0) return;

    addBomFiles(files);
  }, [bomFiles, bomOrderInfo.soNumber]);

  const handleBomFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      f => f.name.endsWith('.csv') || f.type === 'text/csv'
    );

    if (files.length > 0) {
      addBomFiles(files);
    }

    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const addBomFiles = (files: File[]) => {
    const soNum = bomOrderInfo.soNumber || '0000';
    const existingCount = bomFiles.length;

    const newEntries = files.map((file, i) => {
      const toolModel = file.name.replace(/\.csv$/i, '').trim();
      const toolNumber = `${soNum}-${existingCount + i + 1}`;
      return { file, toolModel, toolNumber };
    });

    setBomFiles(prev => [...prev, ...newEntries]);
    // Clear any previous parse results when files change
    setBomParseResult(null);
    setBomParseErrors([]);
  };

  const removeBomFile = (index: number) => {
    setBomFiles(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Re-number tool numbers
      const soNum = bomOrderInfo.soNumber || '0000';
      return updated.map((entry, i) => ({
        ...entry,
        toolNumber: `${soNum}-${i + 1}`,
      }));
    });
    setBomParseResult(null);
    setBomParseErrors([]);
  };

  // Re-number tool numbers when SO number changes
  const handleSoNumberChange = (value: string) => {
    setBomOrderInfo(prev => ({ ...prev, soNumber: value }));
    if (bomFiles.length > 0) {
      const soNum = value || '0000';
      setBomFiles(prev => prev.map((entry, i) => ({
        ...entry,
        toolNumber: `${soNum}-${i + 1}`,
      })));
    }
  };

  const handleParseBOMs = async () => {
    setBomParseErrors([]);
    setBomParseResult(null);

    if (bomFiles.length === 0) {
      setBomParseErrors(['Please add at least one BOM CSV file.']);
      return;
    }

    if (!bomOrderInfo.soNumber.trim()) {
      setBomParseErrors(['SO Number is required.']);
      return;
    }

    const allWarnings: string[] = [];
    const parsedBOMs: ParsedBOM[] = [];

    // Parse each file
    for (const entry of bomFiles) {
      const text = await entry.file.text();
      const parsed = parseBOMCsv(text, entry.toolModel);
      parsedBOMs.push(parsed);
      allWarnings.push(...parsed.warnings);

      if (parsed.leafParts.length === 0) {
        allWarnings.push(`No leaf parts found in ${entry.toolModel}`);
      }
    }

    // Build tool mappings
    const toolMappings: ToolMapping[] = bomFiles.map(entry => ({
      toolModel: entry.toolModel,
      toolNumber: entry.toolNumber,
    }));

    // Merge BOMs
    const merged = mergeMultipleBOMs(parsedBOMs, toolMappings);

    // Build the ImportedOrder
    const order = buildImportedOrder(
      merged,
      {
        soNumber: bomOrderInfo.soNumber.trim(),
        poNumber: bomOrderInfo.poNumber.trim() || undefined,
        customerName: bomOrderInfo.customerName.trim() || undefined,
        purchaseDate: bomOrderInfo.purchaseDate || undefined,
        dueDate: bomOrderInfo.dueDate || undefined,
        estimatedShipDate: bomOrderInfo.estimatedShipDate || undefined,
      },
      toolMappings,
      catalogParts
    );

    if (order.line_items.length === 0) {
      setBomParseErrors(['No parts were extracted from the BOM files. Check that the CSV format is correct.']);
      return;
    }

    // Check for conflicts
    if (catalogParts.length > 0) {
      const foundConflicts = checkForConflicts(order.line_items);
      if (foundConflicts.length > 0) {
        setConflicts(foundConflicts);
      }
    }

    setBomParseResult({ merged, order, warnings: allWarnings });
  };

  const handleBomImport = async () => {
    if (!bomParseResult?.order) return;

    setIsImporting(true);

    // Apply conflict resolutions
    if (conflicts.length > 0) {
      await applyConflictResolutions(conflicts);
    }

    // Save parts to catalog
    if (saveToCatalog) {
      await savePartsFromImport(bomParseResult.order.line_items, true);
    }

    const result = await importOrder(bomParseResult.order);
    setIsImporting(false);

    if (result) {
      const partCount = bomParseResult.order.line_items.length;
      const toolCount = bomParseResult.order.tools.length;
      const toolNumbers = bomParseResult.order.tools.map(t => t.tool_number);
      logActivity({
        type: 'order_imported',
        order_id: result.id,
        so_number: bomParseResult.order.so_number,
        description: `Order SO-${bomParseResult.order.so_number} imported with ${partCount} parts and ${toolCount} tools`,
        performed_by: getUserName(),
        details: {
          part_count: partCount,
          tool_count: toolCount,
          tool_numbers: toolNumbers,
        },
      });

      // Auto-extract BOM template
      const toolModel = bomParseResult.order.tools[0]?.tool_model || null;
      await autoExtractTemplate(bomParseResult.order.line_items, toolModel, bomParseResult.order.so_number);

      // Auto-extract assembly templates
      await autoExtractAssemblyTemplates(bomParseResult.order.line_items);

      navigate(`/orders/${result.id}`);
    }
  };

  const clearBomResult = () => {
    setBomParseResult(null);
    setBomParseErrors([]);
    setBomFiles([]);
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

      <Tabs defaultValue="standard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="standard">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Standard Import
          </TabsTrigger>
          <TabsTrigger value="multi-bom">
            <Files className="h-4 w-4 mr-2" />
            Multi-BOM Import
          </TabsTrigger>
        </TabsList>

        {/* ======================== STANDARD IMPORT TAB ======================== */}
        <TabsContent value="standard" className="space-y-6">
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
                  {(() => {
                    const hasAssemblyGroup = parseResult.order.line_items.some(item => item.assembly_group);
                    return (
                  <div className="max-h-64 overflow-auto border rounded-lg">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2 whitespace-nowrap">Part Number</th>
                          <th className="text-left p-2">Description</th>
                          {hasAssemblyGroup && (
                            <th className="text-left p-2 whitespace-nowrap">Assembly</th>
                          )}
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
                            {hasAssemblyGroup && (
                              <td className="p-2 whitespace-nowrap text-xs text-muted-foreground font-mono">
                                {item.assembly_group || '-'}
                              </td>
                            )}
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
                    );
                  })()}
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
                <Button variant="outline" onClick={() => downloadImportTemplate('single-bom')}>
                  <Download className="mr-2 h-4 w-4" />
                  Single Tool Type (BOM)
                </Button>
                <Button variant="outline" onClick={() => downloadImportTemplate('multi')}>
                  <Download className="mr-2 h-4 w-4" />
                  Multiple Tool Types
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                <strong>Single Tool Type:</strong> All tools share the same flat parts list (e.g., 5x identical 230Q units).
                <br />
                <strong>Single Tool Type (BOM):</strong> Same as above but with a Level column for hierarchical BOMs. Only leaf parts are imported.
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
                <h4 className="font-medium mb-1">BOM Hierarchy (Level Column)</h4>
                <p className="text-muted-foreground">
                  Any format above can include an optional "Level" column to define assembly hierarchies.
                  When present, only leaf parts are imported, quantities are multiplied through the parent chain,
                  and the top-level assembly becomes the grouping label.
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
        </TabsContent>

        {/* ======================== MULTI-BOM IMPORT TAB ======================== */}
        <TabsContent value="multi-bom" className="space-y-6">
          {!bomParseResult ? (
            <>
              {/* Order Info Form */}
              <Card>
                <CardHeader>
                  <CardTitle>Order Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bom-so">SO Number *</Label>
                      <Input
                        id="bom-so"
                        placeholder="e.g., 3930"
                        value={bomOrderInfo.soNumber}
                        onChange={(e) => handleSoNumberChange(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bom-po">PO Number</Label>
                      <Input
                        id="bom-po"
                        placeholder="Optional"
                        value={bomOrderInfo.poNumber}
                        onChange={(e) => setBomOrderInfo(prev => ({ ...prev, poNumber: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bom-customer">Customer Name</Label>
                      <Input
                        id="bom-customer"
                        placeholder="e.g., Sonovision"
                        value={bomOrderInfo.customerName}
                        onChange={(e) => setBomOrderInfo(prev => ({ ...prev, customerName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bom-purchase">Purchase Date</Label>
                      <Input
                        id="bom-purchase"
                        type="date"
                        value={bomOrderInfo.purchaseDate}
                        onChange={(e) => setBomOrderInfo(prev => ({ ...prev, purchaseDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bom-due">Due Date</Label>
                      <Input
                        id="bom-due"
                        type="date"
                        value={bomOrderInfo.dueDate}
                        onChange={(e) => setBomOrderInfo(prev => ({ ...prev, dueDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bom-ship">Est. Ship Date</Label>
                      <Input
                        id="bom-ship"
                        type="date"
                        value={bomOrderInfo.estimatedShipDate}
                        onChange={(e) => setBomOrderInfo(prev => ({ ...prev, estimatedShipDate: e.target.value }))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* BOM File Upload */}
              <Card>
                <CardHeader>
                  <CardTitle>BOM Files</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    className={`
                      border-2 border-dashed rounded-lg p-8 text-center transition-colors
                      ${isBomDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
                    `}
                    onDrop={handleBomFileDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsBomDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsBomDragging(false); }}
                  >
                    <Files className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-lg font-medium mb-1">
                      Drop BOM CSV files here
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">
                      One CSV per tool variation (e.g., 230QR-10002.csv, 230QR-10003.csv)
                    </p>
                    <label htmlFor="bom-file-upload">
                      <Button asChild variant="outline">
                        <span>
                          <Upload className="mr-2 h-4 w-4" />
                          Browse CSV Files
                        </span>
                      </Button>
                    </label>
                    <input
                      id="bom-file-upload"
                      type="file"
                      accept=".csv"
                      multiple
                      onChange={handleBomFileInput}
                      className="hidden"
                    />
                  </div>

                  {/* File List */}
                  {bomFiles.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">
                        Uploaded Files ({bomFiles.length})
                      </h4>
                      <div className="space-y-1">
                        {bomFiles.map((entry, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="font-mono text-sm truncate">{entry.toolModel}</p>
                                <p className="text-xs text-muted-foreground">
                                  Tool: {entry.toolNumber}
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0"
                              onClick={() => removeBomFile(i)}
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Parse Errors */}
                  {bomParseErrors.length > 0 && (
                    <div className="p-4 bg-destructive/10 rounded-lg">
                      <div className="flex items-center gap-2 text-destructive mb-2">
                        <AlertCircle className="h-5 w-5" />
                        <span className="font-medium">Parse Failed</span>
                      </div>
                      <ul className="list-disc list-inside text-sm">
                        {bomParseErrors.map((error, i) => (
                          <li key={i}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Parse Button */}
                  {bomFiles.length > 0 && (
                    <div className="flex justify-end">
                      <Button onClick={handleParseBOMs}>
                        Parse &amp; Preview
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Multi-BOM Help */}
              <Card>
                <CardHeader>
                  <CardTitle>Multi-BOM Format Guide</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    Use this mode when each tool has its own multi-level BOM (e.g., Sonovision orders
                    where tools are variations of each other).
                  </p>
                  <div>
                    <h4 className="font-medium mb-1">Expected CSV Format</h4>
                    <ul className="list-disc list-inside text-muted-foreground">
                      <li>Columns: Level, Part Number, Type, Qty, Description</li>
                      <li>Multi-level hierarchy (Level 0 = root, Level 1 = top assembly, etc.)</li>
                      <li>Only leaf parts (no sub-components) are extracted for picking</li>
                      <li>Quantities are multiplied through the hierarchy</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">How Merging Works</h4>
                    <ul className="list-disc list-inside text-muted-foreground">
                      <li>Parts shared across all BOMs at the same qty become shared line items</li>
                      <li>Parts unique to specific tools become tool-specific line items</li>
                      <li>Descriptions and locations are auto-filled from your Parts Catalog</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            /* Multi-BOM Preview */
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  Preview: SO-{bomOrderInfo.soNumber}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={clearBomResult}>
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Warnings */}
                {bomParseResult.warnings.length > 0 && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-950/20 dark:border-yellow-800">
                    <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Warnings</p>
                    <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300">
                      {bomParseResult.warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <div className="text-2xl font-bold">{bomParseResult.merged.stats.totalParts}</div>
                    <div className="text-sm text-muted-foreground">Total Parts</div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                      {bomParseResult.merged.stats.sharedCount}
                    </div>
                    <div className="text-sm text-muted-foreground">Shared</div>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                      {bomParseResult.merged.stats.toolSpecificCount}
                    </div>
                    <div className="text-sm text-muted-foreground">Tool-Specific</div>
                  </div>
                </div>

                {/* Tools */}
                <div>
                  <h3 className="font-medium mb-2">
                    Tools ({bomParseResult.order.tools.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {bomParseResult.order.tools.map((tool, i) => (
                      <Badge key={i} variant="secondary">
                        {tool.tool_number}
                        {tool.tool_model && ` [${tool.tool_model}]`}
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

                {/* Line Items Preview */}
                <div>
                  <h3 className="font-medium mb-2">
                    Line Items ({bomParseResult.order.line_items.length})
                  </h3>
                  <div className="max-h-96 overflow-auto border rounded-lg">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2 whitespace-nowrap">Part Number</th>
                          <th className="text-left p-2">Description</th>
                          <th className="text-left p-2 whitespace-nowrap">Assembly</th>
                          <th className="text-center p-2 whitespace-nowrap">Scope</th>
                          <th className="text-center p-2 whitespace-nowrap">Qty/Unit</th>
                          <th className="text-center p-2 whitespace-nowrap">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bomParseResult.merged.lineItems.slice(0, 100).map((mergedItem, i) => {
                          const importedItem = bomParseResult.order.line_items[i];
                          return (
                            <tr key={i} className="border-t">
                              <td className="p-2 font-mono whitespace-nowrap">{mergedItem.partNumber}</td>
                              <td className="p-2 text-muted-foreground max-w-[200px] truncate">
                                {importedItem?.description || mergedItem.description || '-'}
                              </td>
                              <td className="p-2 whitespace-nowrap text-xs text-muted-foreground font-mono">
                                {mergedItem.assemblyGroup || '-'}
                              </td>
                              <td className="p-2 text-center">
                                {mergedItem.isShared ? (
                                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400 dark:border-green-700">
                                    Shared
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700">
                                    {mergedItem.toolModels.length} tool{mergedItem.toolModels.length !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2 text-center">{mergedItem.qtyPerUnit}</td>
                              <td className="p-2 text-center">{importedItem?.total_qty_needed ?? '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {bomParseResult.merged.lineItems.length > 100 && (
                      <p className="p-2 text-center text-muted-foreground">
                        ...and {bomParseResult.merged.lineItems.length - 100} more items
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
                  <Button variant="outline" onClick={clearBomResult}>
                    Cancel
                  </Button>
                  <Button onClick={handleBomImport} disabled={isImporting}>
                    {isImporting ? 'Importing...' : 'Import Order'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

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
