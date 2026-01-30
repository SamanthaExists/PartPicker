import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, fromEvent, merge } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

export interface QueuedPick {
  id: string;
  lineItemId: string;
  toolId: string;
  qtyPicked: number;
  pickedBy?: string;
  notes?: string;
  timestamp: string;
}

const OFFLINE_QUEUE_KEY = 'offline-picks-queue';

@Injectable({
  providedIn: 'root'
})
export class OfflineService implements OnDestroy {
  private onlineSubject = new BehaviorSubject<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  private queueSubject = new BehaviorSubject<QueuedPick[]>([]);
  private syncingSubject = new BehaviorSubject<boolean>(false);

  private onlineListener: (() => void) | null = null;
  private offlineListener: (() => void) | null = null;

  isOnline$ = this.onlineSubject.asObservable();
  queue$ = this.queueSubject.asObservable();
  isSyncing$ = this.syncingSubject.asObservable();

  get isOnline(): boolean {
    return this.onlineSubject.getValue();
  }

  get queueCount(): number {
    return this.queueSubject.getValue().length;
  }

  get queue(): QueuedPick[] {
    return this.queueSubject.getValue();
  }

  constructor() {
    this.loadQueueFromStorage();
    this.setupOnlineStatusListeners();
  }

  ngOnDestroy(): void {
    if (this.onlineListener) {
      window.removeEventListener('online', this.onlineListener);
    }
    if (this.offlineListener) {
      window.removeEventListener('offline', this.offlineListener);
    }
  }

  private setupOnlineStatusListeners(): void {
    this.onlineListener = () => {
      this.onlineSubject.next(true);
      this.emitSyncReadyEvent();
    };
    this.offlineListener = () => this.onlineSubject.next(false);

    window.addEventListener('online', this.onlineListener);
    window.addEventListener('offline', this.offlineListener);
  }

  private loadQueueFromStorage(): void {
    try {
      const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (stored) {
        this.queueSubject.next(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load offline queue:', e);
    }
  }

  private saveQueueToStorage(): void {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.queueSubject.getValue()));
    } catch (e) {
      console.error('Failed to save offline queue:', e);
    }
  }

  private emitSyncReadyEvent(): void {
    const count = this.queueCount;
    if (count > 0 && !this.syncingSubject.getValue()) {
      window.dispatchEvent(
        new CustomEvent('offline-queue-ready-to-sync', {
          detail: { count },
        })
      );
    }
  }

  /**
   * Add a pick to the offline queue
   */
  addToQueue(pick: Omit<QueuedPick, 'id' | 'timestamp'>): QueuedPick {
    const newPick: QueuedPick = {
      ...pick,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };

    const currentQueue = this.queueSubject.getValue();
    this.queueSubject.next([...currentQueue, newPick]);
    this.saveQueueToStorage();

    return newPick;
  }

  /**
   * Remove a pick from the queue (after successful sync)
   */
  removeFromQueue(id: string): void {
    const currentQueue = this.queueSubject.getValue();
    this.queueSubject.next(currentQueue.filter(p => p.id !== id));
    this.saveQueueToStorage();
  }

  /**
   * Clear the entire queue
   */
  clearQueue(): void {
    this.queueSubject.next([]);
    this.saveQueueToStorage();
  }

  /**
   * Set syncing status
   */
  setSyncing(syncing: boolean): void {
    this.syncingSubject.next(syncing);
  }

  /**
   * Sync the offline queue
   * @param recordPick Function to record a pick to the database
   * @returns Result with success and failed counts
   */
  async syncQueue(
    recordPick: (
      lineItemId: string,
      toolId: string,
      qtyPicked: number,
      pickedBy?: string,
      notes?: string
    ) => Promise<unknown>
  ): Promise<{ success: number; failed: number }> {
    const queue = this.queueSubject.getValue();

    if (queue.length === 0) {
      return { success: 0, failed: 0 };
    }

    this.syncingSubject.next(true);
    let success = 0;
    let failed = 0;

    for (const pick of queue) {
      try {
        const result = await recordPick(
          pick.lineItemId,
          pick.toolId,
          pick.qtyPicked,
          pick.pickedBy,
          pick.notes
        );

        if (result) {
          this.removeFromQueue(pick.id);
          success++;
        } else {
          failed++;
        }
      } catch (e) {
        console.error('Failed to sync pick:', e);
        failed++;
      }
    }

    this.syncingSubject.next(false);
    return { success, failed };
  }
}
