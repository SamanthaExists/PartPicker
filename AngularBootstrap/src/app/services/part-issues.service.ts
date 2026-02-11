import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { PartIssue, PartIssueType } from '../models';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class PartIssuesService implements OnDestroy {
  private issuesSubject = new BehaviorSubject<PartIssue[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(true);
  private errorSubject = new BehaviorSubject<string | null>(null);
  private subscription: RealtimeChannel | null = null;
  private initialized = false;

  issues$ = this.issuesSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  ngOnDestroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    await this.fetchIssues();
    this.setupRealtimeSubscription();
  }

  private setupRealtimeSubscription(): void {
    this.subscription = this.supabase.channel('part-issues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'part_issues' }, () => {
        this.fetchIssues();
      })
      .subscribe();
  }

  async fetchIssues(): Promise<void> {
    try {
      this.loadingSubject.next(true);
      this.errorSubject.next(null);

      const { data, error } = await this.supabase.from('part_issues')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.issuesSubject.next(data || []);
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to fetch part issues');
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async reportIssue(
    partNumber: string,
    issueType: PartIssueType,
    description?: string,
    reportedBy?: string
  ): Promise<PartIssue | null> {
    try {
      const { data, error } = await this.supabase.from('part_issues')
        .insert({
          part_number: partNumber,
          issue_type: issueType,
          description: description || null,
          reported_by: reportedBy || null,
          status: 'open',
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
      const { error } = await this.supabase.from('part_issues')
        .update({
          status: 'resolved',
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
      const { error } = await this.supabase.from('part_issues')
        .update({
          status: 'open',
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

  async deleteIssue(issueId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.from('part_issues')
        .delete()
        .eq('id', issueId);

      if (error) throw error;
      return true;
    } catch (err) {
      this.errorSubject.next(err instanceof Error ? err.message : 'Failed to delete issue');
      return false;
    }
  }

  getIssuesForPart(partNumber: string): PartIssue[] {
    return this.issuesSubject.getValue().filter(i => i.part_number === partNumber);
  }

  hasOpenIssue(partNumber: string): boolean {
    return this.issuesSubject.getValue().some(
      i => i.part_number === partNumber && i.status === 'open'
    );
  }

  getOpenIssue(partNumber: string): PartIssue | undefined {
    return this.issuesSubject.getValue().find(
      i => i.part_number === partNumber && i.status === 'open'
    );
  }
}
