import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ActivityLogType } from '../models';

interface ActivityLogInput {
  type: ActivityLogType;
  order_id: string;
  so_number: string;
  part_number?: string | null;
  description: string;
  performed_by?: string;
  details?: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root'
})
export class ActivityLogService {
  constructor(private supabaseService: SupabaseService) {}

  async logActivity(entry: ActivityLogInput): Promise<void> {
    try {
      const { error } = await this.supabaseService.client
        .from('activity_log')
        .insert({
          type: entry.type,
          order_id: entry.order_id,
          so_number: entry.so_number,
          part_number: entry.part_number ?? null,
          description: entry.description,
          performed_by: entry.performed_by ?? null,
          details: entry.details ?? null,
        });

      if (error) {
        console.error('Failed to log activity:', error);
      }
    } catch (err) {
      console.error('Failed to log activity:', err);
    }
  }
}
