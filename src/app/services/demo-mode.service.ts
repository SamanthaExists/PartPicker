import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DemoModeService {
  private readonly DEMO_MODE_KEY = 'partpicker_demo_mode';
  private demoModeSubject = new BehaviorSubject<boolean>(false);
  
  demoMode$ = this.demoModeSubject.asObservable();

  constructor() {
    this.checkDemoMode();
  }

  private checkDemoMode(): void {
    // Check URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const demoParam = urlParams.get('demo');
    
    if (demoParam === 'true') {
      this.enableDemoMode();
      return;
    }

    // Check sessionStorage
    const stored = sessionStorage.getItem(this.DEMO_MODE_KEY);
    if (stored === 'true') {
      this.demoModeSubject.next(true);
    }
  }

  enableDemoMode(): void {
    sessionStorage.setItem(this.DEMO_MODE_KEY, 'true');
    this.demoModeSubject.next(true);
  }

  disableDemoMode(): void {
    sessionStorage.removeItem(this.DEMO_MODE_KEY);
    this.demoModeSubject.next(false);
    
    // Remove demo param from URL and reload
    const url = new URL(window.location.href);
    url.searchParams.delete('demo');
    window.history.replaceState({}, '', url.toString());
    window.location.reload();
  }

  isDemoMode(): boolean {
    return this.demoModeSubject.value;
  }
}
