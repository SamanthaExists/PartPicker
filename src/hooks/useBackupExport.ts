import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { exportFullBackupToExcel, type BackupData } from '@/lib/excelExport';

export function useBackupExport() {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportBackup = async () => {
    setExporting(true);
    setError(null);

    try {
      // Fetch all tables in parallel
      const [
        ordersResult,
        toolsResult,
        lineItemsResult,
        picksResult,
        issuesResult,
        catalogResult,
        templatesResult,
        templateItemsResult,
      ] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('tools').select('*').order('created_at', { ascending: false }),
        supabase.from('line_items').select('*').order('created_at', { ascending: false }),
        supabase.from('picks').select('*').order('picked_at', { ascending: false }),
        supabase.from('issues').select('*').order('created_at', { ascending: false }),
        supabase.from('parts_catalog').select('*').order('part_number', { ascending: true }),
        supabase.from('bom_templates').select('*').order('name', { ascending: true }),
        supabase.from('bom_template_items').select('*'),
      ]);

      // Check for errors
      const errors: string[] = [];
      if (ordersResult.error) errors.push(`Orders: ${ordersResult.error.message}`);
      if (toolsResult.error) errors.push(`Tools: ${toolsResult.error.message}`);
      if (lineItemsResult.error) errors.push(`Line Items: ${lineItemsResult.error.message}`);
      if (picksResult.error) errors.push(`Picks: ${picksResult.error.message}`);
      if (issuesResult.error) errors.push(`Issues: ${issuesResult.error.message}`);
      // These tables might not exist in older setups, so we handle them gracefully
      // if (catalogResult.error) errors.push(`Parts Catalog: ${catalogResult.error.message}`);
      // if (templatesResult.error) errors.push(`BOM Templates: ${templatesResult.error.message}`);
      // if (templateItemsResult.error) errors.push(`BOM Template Items: ${templateItemsResult.error.message}`);

      if (errors.length > 0) {
        setError(errors.join('\n'));
        return false;
      }

      const backupData: BackupData = {
        orders: ordersResult.data || [],
        tools: toolsResult.data || [],
        lineItems: lineItemsResult.data || [],
        picks: picksResult.data || [],
        issues: issuesResult.data || [],
        partsCatalog: catalogResult.data || [],
        bomTemplates: templatesResult.data || [],
        bomTemplateItems: templateItemsResult.data || [],
      };

      // Export to Excel
      exportFullBackupToExcel(backupData);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      return false;
    } finally {
      setExporting(false);
    }
  };

  return { exportBackup, exporting, error };
}
