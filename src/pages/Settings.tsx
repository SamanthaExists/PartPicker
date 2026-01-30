import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/hooks/useSettings';
import { SCHEMA_SQL, MIGRATION_QTY_AVAILABLE_SQL, MIGRATION_QTY_ON_ORDER_SQL } from '@/lib/supabase';
import { useState, useRef } from 'react';
import { usePWA, useServiceWorker } from '@/hooks/usePWA';
import { useOnlineStatus, useOfflineQueue } from '@/hooks/useOffline';
import { useInventorySync } from '@/hooks/useInventorySync';
import { usePartListSync } from '@/hooks/usePartListSync';
import { useBackupExport } from '@/hooks/useBackupExport';
import { Download, RefreshCw, Wifi, WifiOff, Trash2, CloudOff, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Database, HardDrive, ListChecks } from 'lucide-react';

export function Settings() {
  const { settings, updateSettings } = useSettings();
  const [showSchema, setShowSchema] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedMigration, setCopiedMigration] = useState(false);

  // PWA hooks
  const { isInstallable, isInstalled, install } = usePWA();
  const { needsRefresh, refresh } = useServiceWorker();
  const isOnline = useOnlineStatus();
  const { queueCount, clearQueue } = useOfflineQueue();

  // Inventory sync
  const { syncInventory, syncing, lastSyncResult } = useInventorySync();
  const inventoryFileRef = useRef<HTMLInputElement>(null);

  // Part List sync
  const { syncPartList, syncing: syncingPartList, lastSyncResult: lastPartListSyncResult } = usePartListSync();
  const partListFileRef = useRef<HTMLInputElement>(null);
  const [showPartListMigration, setShowPartListMigration] = useState(false);
  const [copiedPartListMigration, setCopiedPartListMigration] = useState(false);

  // Backup export
  const { exportBackup, exporting: exportingBackup, error: backupError } = useBackupExport();
  const [backupSuccess, setBackupSuccess] = useState(false);

  const handleExportBackup = async () => {
    setBackupSuccess(false);
    const success = await exportBackup();
    if (success) {
      setBackupSuccess(true);
      setTimeout(() => setBackupSuccess(false), 3000);
    }
  };

  const handleCopySchema = async () => {
    await navigator.clipboard.writeText(SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMigration = async () => {
    await navigator.clipboard.writeText(MIGRATION_QTY_AVAILABLE_SQL);
    setCopiedMigration(true);
    setTimeout(() => setCopiedMigration(false), 2000);
  };

  const handleInventoryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await syncInventory(file);
      // Reset file input
      if (inventoryFileRef.current) {
        inventoryFileRef.current.value = '';
      }
    }
  };

  const handlePartListFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await syncPartList(file);
      // Reset file input
      if (partListFileRef.current) {
        partListFileRef.current.value = '';
      }
    }
  };

  const handleCopyPartListMigration = async () => {
    await navigator.clipboard.writeText(MIGRATION_QTY_ON_ORDER_SQL);
    setCopiedPartListMigration(true);
    setTimeout(() => setCopiedPartListMigration(false), 2000);
  };

  const handleClearQueue = () => {
    if (window.confirm(`Are you sure you want to clear ${queueCount} pending pick(s)? This action cannot be undone.`)) {
      clearQueue();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your preferences and app settings
        </p>
      </div>

      {/* Inventory Sync */}
      <Card>
        <CardHeader>
          <CardTitle>Inventory Sync</CardTitle>
          <CardDescription>
            Update part locations and available quantities from inventory export
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              ref={inventoryFileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleInventoryFileSelect}
              className="hidden"
              id="inventory-file"
            />
            <Button
              onClick={() => inventoryFileRef.current?.click()}
              disabled={syncing}
              className="gap-2"
            >
              {syncing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Import Inventory File
                </>
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              Supports .xlsx files (e.g., Inventory Locations.xlsx)
            </span>
          </div>

          {lastSyncResult && (
            <div className={`p-4 rounded-lg border ${
              lastSyncResult.success
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
            }`}>
              <div className="flex items-start gap-3">
                {lastSyncResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-medium ${
                    lastSyncResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                  }`}>
                    {lastSyncResult.success ? 'Inventory Sync Complete' : 'Sync Failed'}
                  </p>
                  <div className="mt-2 text-sm space-y-1">
                    <p>Updated: <strong>{lastSyncResult.updatedCount}</strong> line items</p>
                    {lastSyncResult.notFoundCount > 0 && (
                      <p className="text-amber-600 dark:text-amber-400">
                        Not found in inventory: <strong>{lastSyncResult.notFoundCount}</strong> line items
                        ({lastSyncResult.notFoundParts.length} unique parts)
                      </p>
                    )}
                    {lastSyncResult.notFoundParts.length > 0 && lastSyncResult.notFoundParts.length <= 10 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-muted-foreground">
                          Show missing part numbers
                        </summary>
                        <ul className="mt-1 ml-4 text-xs font-mono">
                          {lastSyncResult.notFoundParts.map(p => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {lastSyncResult.errors.length > 0 && (
                      <div className="mt-2 text-red-600 dark:text-red-400">
                        {lastSyncResult.errors.map((err, i) => (
                          <p key={i}>{err}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Expected file format:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Product Id</strong> - Part number to match</li>
              <li><strong>Lot Id</strong> - Timestamp (yyyymmdd...) for selecting newest lot</li>
              <li><strong>Location</strong> - Storage location to update</li>
              <li><strong>Qty Available</strong> - Available quantity</li>
            </ul>
            <p className="text-xs mt-2">
              For parts with multiple lots, the newest lot (highest Lot Id) is used.
            </p>
          </div>

          {/* Migration SQL for qty_available column */}
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMigration(!showMigration)}
            >
              {showMigration ? 'Hide' : 'Show'} Migration SQL
            </Button>

            {showMigration && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm">Run this SQL if qty_available column is missing:</Label>
                  <Button size="sm" variant="secondary" onClick={handleCopyMigration}>
                    {copiedMigration ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                  {MIGRATION_QTY_AVAILABLE_SQL}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Part List Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            Part List Sync
          </CardTitle>
          <CardDescription>
            Update part metadata (locations, descriptions, quantities) from Part List report
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              ref={partListFileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handlePartListFileSelect}
              className="hidden"
              id="partlist-file"
            />
            <Button
              onClick={() => partListFileRef.current?.click()}
              disabled={syncingPartList}
              className="gap-2"
            >
              {syncingPartList ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Import Part List Report
                </>
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              Supports .xlsx files (e.g., Part List.xlsx)
            </span>
          </div>

          {lastPartListSyncResult && (
            <div className={`p-4 rounded-lg border ${
              lastPartListSyncResult.success
                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
            }`}>
              <div className="flex items-start gap-3">
                {lastPartListSyncResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-medium ${
                    lastPartListSyncResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                  }`}>
                    {lastPartListSyncResult.success ? 'Part List Sync Complete' : 'Sync Failed'}
                  </p>
                  <div className="mt-2 text-sm space-y-1">
                    <p>Updated: <strong>{lastPartListSyncResult.updatedCount}</strong> line items</p>
                    {lastPartListSyncResult.notFoundCount > 0 && (
                      <p className="text-amber-600 dark:text-amber-400">
                        Not found in Part List: <strong>{lastPartListSyncResult.notFoundCount}</strong> line items
                        ({lastPartListSyncResult.notFoundParts.length} unique parts)
                      </p>
                    )}
                    {lastPartListSyncResult.notFoundParts.length > 0 && lastPartListSyncResult.notFoundParts.length <= 10 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-muted-foreground">
                          Show missing part numbers
                        </summary>
                        <ul className="mt-1 ml-4 text-xs font-mono">
                          {lastPartListSyncResult.notFoundParts.map(p => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {lastPartListSyncResult.errors.length > 0 && (
                      <div className="mt-2 text-red-600 dark:text-red-400">
                        {lastPartListSyncResult.errors.map((err, i) => (
                          <p key={i}>{err}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Expected file format:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Product Id</strong> - Part number to match</li>
              <li><strong>Location(s)</strong> - Storage location to update</li>
              <li><strong>Qty Available</strong> - Available quantity</li>
              <li><strong>Qty On Order</strong> - Quantity on order (optional)</li>
              <li><strong>Description</strong> - Part description</li>
            </ul>
            <p className="text-xs mt-2">
              This sync updates metadata only - picked quantities are preserved.
            </p>
          </div>

          {/* Migration SQL for qty_on_order column */}
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPartListMigration(!showPartListMigration)}
            >
              {showPartListMigration ? 'Hide' : 'Show'} Migration SQL (for Qty On Order)
            </Button>

            {showPartListMigration && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm">Run this SQL if qty_on_order column is missing:</Label>
                  <Button size="sm" variant="secondary" onClick={handleCopyPartListMigration}>
                    {copiedPartListMigration ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                  {MIGRATION_QTY_ON_ORDER_SQL}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Data Backup
          </CardTitle>
          <CardDescription>
            Export all data to an Excel file for backup or recovery
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={handleExportBackup}
              disabled={exportingBackup}
              className="gap-2"
            >
              {exportingBackup ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  Export Full Backup
                </>
              )}
            </Button>
            {backupSuccess && (
              <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Backup exported successfully!
              </span>
            )}
          </div>

          {backupError && (
            <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-200">Backup Failed</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{backupError}</p>
                </div>
              </div>
            </div>
          )}

          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">What gets exported:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Orders</strong> - All sales orders with status and dates</li>
              <li><strong>Tools</strong> - All tools within orders</li>
              <li><strong>Line Items</strong> - All parts with quantities and locations</li>
              <li><strong>Picks</strong> - Complete pick history (who, what, when)</li>
              <li><strong>Issues</strong> - Reported issues and resolutions</li>
              <li><strong>Parts Catalog</strong> - Saved part numbers and descriptions</li>
              <li><strong>BOM Templates</strong> - Saved bill of materials templates</li>
            </ul>
            <p className="text-xs mt-3 p-2 bg-muted rounded">
              Tip: Export a backup regularly (weekly) and save the files to a safe location
              like OneDrive, Google Drive, or an external drive.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* User Settings */}
      <Card>
        <CardHeader>
          <CardTitle>User Settings</CardTitle>
          <CardDescription>
            Your name will be recorded with picks for tracking purposes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user_name">Your Name</Label>
            <Input
              id="user_name"
              placeholder="Enter your name"
              value={settings.user_name}
              onChange={(e) => updateSettings({ user_name: e.target.value })}
              className="max-w-md"
            />
            <p className="text-sm text-muted-foreground">
              This name will be attached to your picks so others can see who picked what.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* PWA / Offline Settings */}
      <Card>
        <CardHeader>
          <CardTitle>App Installation & Offline</CardTitle>
          <CardDescription>
            Install the app for offline access and better performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              {isOnline ? (
                <Wifi className="h-5 w-5 text-green-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-amber-500" />
              )}
              <div>
                <p className="font-medium">Connection Status</p>
                <p className="text-sm text-muted-foreground">
                  {isOnline ? 'You are online' : 'You are offline - picks will be queued'}
                </p>
              </div>
            </div>
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                isOnline
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              }`}
            >
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Offline Queue */}
          {queueCount > 0 && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex items-center gap-3">
                <CloudOff className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="font-medium">Pending Picks</p>
                  <p className="text-sm text-muted-foreground">
                    {queueCount} pick(s) waiting to sync
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearQueue}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          )}

          {/* Install App */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <Download className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Install App</p>
                <p className="text-sm text-muted-foreground">
                  {isInstalled
                    ? 'App is installed on this device'
                    : isInstallable
                      ? 'Install for offline access and quick launch'
                      : 'Installation not available in this browser'}
                </p>
              </div>
            </div>
            {isInstallable && !isInstalled && (
              <Button onClick={install} size="sm">
                <Download className="h-4 w-4 mr-1" />
                Install
              </Button>
            )}
            {isInstalled && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                Installed
              </span>
            )}
          </div>

          {/* Update Available */}
          {needsRefresh && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-primary bg-primary/5">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Update Available</p>
                  <p className="text-sm text-muted-foreground">
                    A new version of the app is ready
                  </p>
                </div>
              </div>
              <Button onClick={refresh} size="sm">
                <RefreshCw className="h-4 w-4 mr-1" />
                Update Now
              </Button>
            </div>
          )}

          {/* Offline Features Info */}
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Offline Features:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>View previously loaded orders and parts</li>
              <li>Record picks while offline (syncs when back online)</li>
              <li>Full app functionality without internet</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Database Setup */}
      <Card>
        <CardHeader>
          <CardTitle>Database Setup</CardTitle>
          <CardDescription>
            Instructions for setting up Supabase backend
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            <p>To use this app with real-time sync, you need to:</p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Create a free account at <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">supabase.com</a></li>
              <li>Create a new project</li>
              <li>Go to the SQL Editor and run the schema below</li>
              <li>Copy your project URL and anon key from Settings &gt; API</li>
              <li>Create a <code className="bg-muted px-1 rounded">.env</code> file with:
                <pre className="bg-muted p-2 rounded mt-1 text-xs">
{`VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key`}
                </pre>
              </li>
              <li>Restart the development server</li>
            </ol>
          </div>

          <div className="pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setShowSchema(!showSchema)}
            >
              {showSchema ? 'Hide' : 'Show'} Database Schema
            </Button>

            {showSchema && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <Label>SQL Schema</Label>
                  <Button size="sm" variant="secondary" onClick={handleCopySchema}>
                    {copied ? 'Copied!' : 'Copy to Clipboard'}
                  </Button>
                </div>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto max-h-96">
                  {SCHEMA_SQL}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Tool Pick List Tracker v1.0.0</p>
          <p className="mt-2">
            A web-based application for tracking tool pick lists across multiple
            devices, allowing multiple users to simultaneously mark parts as picked,
            track partial picks per tool, and view consolidated part status across
            all sales orders.
          </p>
          <p className="mt-2">
            This app works offline and can be installed as a Progressive Web App (PWA)
            for quick access from your home screen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
