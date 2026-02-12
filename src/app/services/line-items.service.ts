import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { LineItem, LineItemInput } from '../models';

@Injectable({
  providedIn: 'root'
})
export class LineItemsService {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new BehaviorSubject<string | null>(null);

  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  async addLineItem(orderId: string, input: LineItemInput): Promise<LineItem | null> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      const { data, error } = await this.supabase.from('line_items')
        .insert({
          order_id: orderId,
          part_number: input.part_number,
          description: input.description || null,
          location: input.location || null,
          qty_per_unit: input.qty_per_unit,
          total_qty_needed: input.total_qty_needed,
          qty_available: input.qty_available ?? null,
          tool_ids: input.tool_ids || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to add line item');
      return null;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async updateLineItem(lineItemId: string, input: LineItemInput): Promise<LineItem | null> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      const { data, error } = await this.supabase.from('line_items')
        .update({
          part_number: input.part_number,
          description: input.description || null,
          location: input.location || null,
          qty_per_unit: input.qty_per_unit,
          total_qty_needed: input.total_qty_needed,
          qty_available: input.qty_available ?? null,
          tool_ids: input.tool_ids || null,
        })
        .eq('id', lineItemId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to update line item');
      return null;
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async deleteLineItem(lineItemId: string): Promise<boolean> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      const { error } = await this.supabase.from('line_items')
        .delete()
        .eq('id', lineItemId);

      if (error) throw error;
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to delete line item');
      return false;
    } finally {
      this.loadingSubject.next(false);
    }
  }
}
