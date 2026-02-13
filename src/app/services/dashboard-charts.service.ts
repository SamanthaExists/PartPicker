import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Pick } from '../models';

export interface DailyPickCount {
  date: string; // YYYY-MM-DD
  count: number;
  dayLabel: string; // Mon, Tue, etc.
}

export interface TopPicker {
  picked_by: string;
  count: number;
}

export interface CompletionTrendPoint {
  date: string; // YYYY-MM-DD
  percentage: number;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardChartsService {
  constructor(private supabase: SupabaseService) {}

  /**
   * Get daily pick counts for the last 7 days (excluding undone picks)
   */
  async getLast7DaysPickActivity(): Promise<DailyPickCount[]> {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(now.getDate() - 6); // Include today = 7 days total
      sevenDaysAgo.setHours(0, 0, 0, 0);

      // Fetch all picks from the last 7 days (only non-undone)
      const { data, error } = await this.supabase.from('picks')
        .select('picked_at')
        .is('undone_at', null)
        .gte('picked_at', sevenDaysAgo.toISOString())
        .order('picked_at', { ascending: true });

      if (error) throw error;

      // Group by day
      const countsByDate = new Map<string, number>();
      
      // Initialize all 7 days with 0
      for (let i = 0; i < 7; i++) {
        const date = new Date(sevenDaysAgo);
        date.setDate(sevenDaysAgo.getDate() + i);
        const dateStr = this.formatDateYMD(date);
        countsByDate.set(dateStr, 0);
      }

      // Count picks per day
      (data || []).forEach((pick: any) => {
        const pickDate = new Date(pick.picked_at);
        const dateStr = this.formatDateYMD(pickDate);
        countsByDate.set(dateStr, (countsByDate.get(dateStr) || 0) + 1);
      });

      // Convert to array with day labels
      const result: DailyPickCount[] = [];
      for (let i = 0; i < 7; i++) {
        const date = new Date(sevenDaysAgo);
        date.setDate(sevenDaysAgo.getDate() + i);
        const dateStr = this.formatDateYMD(date);
        result.push({
          date: dateStr,
          count: countsByDate.get(dateStr) || 0,
          dayLabel: this.getDayLabel(date)
        });
      }

      return result;
    } catch (err) {
      console.error('Error fetching daily pick activity:', err);
      return [];
    }
  }

  /**
   * Get top 5 pickers for the current week (Monday-Sunday)
   */
  async getTopPickersThisWeek(): Promise<TopPicker[]> {
    try {
      const { start, end } = this.getCurrentWeekRange();

      // Fetch picks for this week (only non-undone)
      const { data, error } = await this.supabase.from('picks')
        .select('picked_by')
        .is('undone_at', null)
        .gte('picked_at', start.toISOString())
        .lte('picked_at', end.toISOString());

      if (error) throw error;

      // Count picks per user
      const countsByUser = new Map<string, number>();
      (data || []).forEach((pick: any) => {
        const user = pick.picked_by || 'Unknown';
        countsByUser.set(user, (countsByUser.get(user) || 0) + 1);
      });

      // Convert to array and sort by count descending
      const result: TopPicker[] = Array.from(countsByUser.entries())
        .map(([picked_by, count]) => ({ picked_by, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return result;
    } catch (err) {
      console.error('Error fetching top pickers:', err);
      return [];
    }
  }

  /**
   * Get pick completion trend over the last 14 days
   * Completion % = total picked / total needed across all active orders
   */
  async getCompletionTrend(): Promise<CompletionTrendPoint[]> {
    try {
      const now = new Date();
      const fourteenDaysAgo = new Date(now);
      fourteenDaysAgo.setDate(now.getDate() - 13); // Include today = 14 days
      fourteenDaysAgo.setHours(0, 0, 0, 0);

      // Fetch all line items for active orders
      const { data: lineItems, error: lineItemsError } = await this.supabase
        .from('line_items')
        .select(`
          id,
          total_qty_needed,
          orders!inner (
            status
          )
        `)
        .eq('orders.status', 'active');

      if (lineItemsError) throw lineItemsError;

      const totalNeeded = (lineItems || []).reduce((sum: number, item: any) => 
        sum + item.total_qty_needed, 0
      );

      if (totalNeeded === 0) {
        // No active orders, return empty array
        return [];
      }

      const lineItemIds = (lineItems || []).map((item: any) => item.id);

      // Fetch all picks for these line items up to now
      const { data: picks, error: picksError } = await this.supabase
        .from('picks')
        .select('picked_at, qty_picked, line_item_id')
        .in('line_item_id', lineItemIds)
        .is('undone_at', null)
        .lte('picked_at', now.toISOString())
        .order('picked_at', { ascending: true });

      if (picksError) throw picksError;

      // Build cumulative completion for each day
      const result: CompletionTrendPoint[] = [];
      let cumulativePicked = 0;

      for (let i = 0; i < 14; i++) {
        const date = new Date(fourteenDaysAgo);
        date.setDate(fourteenDaysAgo.getDate() + i);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Count picks up to end of this day
        const picksUpToDay = (picks || []).filter((pick: any) => 
          new Date(pick.picked_at) <= endOfDay
        );

        cumulativePicked = picksUpToDay.reduce((sum: number, pick: any) => 
          sum + pick.qty_picked, 0
        );

        const percentage = totalNeeded > 0 
          ? Math.round((cumulativePicked / totalNeeded) * 100) 
          : 0;

        result.push({
          date: this.formatDateYMD(date),
          percentage: Math.min(percentage, 100) // Cap at 100%
        });
      }

      return result;
    } catch (err) {
      console.error('Error fetching completion trend:', err);
      return [];
    }
  }

  // Helper methods

  private formatDateYMD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDayLabel(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  }

  private getCurrentWeekRange(): { start: Date; end: Date } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    
    // Start of week (Monday)
    const start = new Date(now);
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    start.setDate(now.getDate() - daysToMonday);
    start.setHours(0, 0, 0, 0);
    
    // End of week (Sunday)
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    
    return { start, end };
  }
}
