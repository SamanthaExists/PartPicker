import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Issue, IssueWithDetails, IssueType, IssueStatus } from '../models';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DemoModeService } from './demo-mode.service';
import { DemoDataService } from './demo-data.service';

@Injectable({
  providedIn: 'root'
})
export class IssuesService implements OnDestroy {
  private issuesSubject = new BehaviorSubject<IssueWithDetails[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private subscription: RealtimeChannel | null = null;
  private currentOrderId: string | null = null;

  issues$ = this.issuesSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(
    private supabase: SupabaseService,
    private demoMode: DemoModeService,
    private demoData: DemoDataService
  ) {}

  ngOnDestroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  async loadIssuesForOrder(orderId: string): Promise<void> {
    this.cleanup();
    this.currentOrderId = orderId;
    await this.fetchIssues(orderId);
    if (!this.demoMode.isDemoMode()) {
      this.setupRealtimeSubscription(orderId);
    }
  }

  async loadAllIssues(): Promise<void> {
    this.cleanup();
    this.currentOrderId = null;
    await this.fetchAllIssues();
    if (!this.demoMode.isDemoMode()) {
      this.setupGlobalRealtimeSubscription();
    }
  }

  private setupRealtimeSubscription(orderId: string): void {
    if (this.demoMode.isDemoMode()) return;
    
    this.subscription = this.supabase.channel(`issues-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues', filter: `order_id=eq.${orderId}` }, () => {
        if (this.currentOrderId) {
          this.fetchIssues(this.currentOrderId);
        }
      })
      .subscribe();
  }

  private setupGlobalRealtimeSubscription(): void {
    if (this.demoMode.isDemoMode()) return;
    
    this.subscription = this.supabase.channel('all-issues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, () => {
        this.fetchAllIssues();
      })
      .subscribe();
  }

  private async fetchIssues(orderId: string): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      if (this.demoMode.isDemoMode()) {
        const issues = this.demoData.getIssues(orderId);
        const issuesWithDetails: IssueWithDetails[] = issues.map(issue => {
          const lineItems = this.demoData.getLineItems(orderId);
          const orders = this.demoData.getOrders();
          const lineItem = lineItems.find(li => li.id === issue.line_item_id);
          const order = orders.find(o => o.id === issue.order_id);
          
          return {
            ...issue,
            line_item: lineItem,
            order: order,
          };
        });

        this.issuesSubject.next(issuesWithDetails);
        this.loadingSubject.next(false);
        return;
      }

      const { data, error } = await this.supabase.from('issues')
        .select(`
          *,
          line_items (*),
          orders (*)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const issuesWithDetails: IssueWithDetails[] = (data || []).map((issue: any) => ({
        ...issue,
        line_item: issue.line_items,
        order: issue.orders,
      }));

      this.issuesSubject.next(issuesWithDetails);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  private async fetchAllIssues(): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      if (this.demoMode.isDemoMode()) {
        const issues = this.demoData.getIssues();
        const issuesWithDetails: IssueWithDetails[] = issues.map(issue => {
          const lineItems = this.demoData.getLineItems();
          const orders = this.demoData.getOrders();
          const lineItem = lineItems.find(li => li.id === issue.line_item_id);
          const order = orders.find(o => o.id === issue.order_id);
          
          return {
            ...issue,
            line_item: lineItem,
            order: order,
          };
        });

        this.issuesSubject.next(issuesWithDetails);
        this.loadingSubject.next(false);
        return;
      }

      const { data, error } = await this.supabase.from('issues')
        .select(`
          *,
          line_items (*),
          orders (*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const issuesWithDetails: IssueWithDetails[] = (data || []).map((issue: any) => ({
        ...issue,
        line_item: issue.line_items,
        order: issue.orders,
      }));

      this.issuesSubject.next(issuesWithDetails);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async reportIssue(
    lineItemId: string,
    orderId: string,
    issueType: IssueType,
    description?: string,
    reportedBy?: string
  ): Promise<Issue | null> {
    try {
      const { data, error } = await this.supabase.from('issues')
        .insert({
          line_item_id: lineItemId,
          order_id: orderId,
          issue_type: issueType,
          description: description || null,
          reported_by: reportedBy || null,
          status: 'open' as IssueStatus,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to report issue');
      return null;
    }
  }

  async resolveIssue(issueId: string, resolvedBy?: string, resolutionNotes?: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.from('issues')
        .update({
          status: 'resolved' as IssueStatus,
          resolved_at: new Date().toISOString(),
          resolved_by: resolvedBy || null,
          resolution_notes: resolutionNotes || null,
        })
        .eq('id', issueId);

      if (error) throw error;
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to resolve issue');
      return false;
    }
  }

  async reopenIssue(issueId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.from('issues')
        .update({
          status: 'open' as IssueStatus,
          resolved_at: null,
          resolved_by: null,
        })
        .eq('id', issueId);

      if (error) throw error;
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to reopen issue');
      return false;
    }
  }

  hasOpenIssue(lineItemId: string): boolean {
    const issues = this.issuesSubject.getValue();
    return issues.some(issue => issue.line_item_id === lineItemId && issue.status === 'open');
  }
}
