import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

@Component({
  selector: 'app-keyboard-help',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal fade" [class.show]="isOpen" [style.display]="isOpen ? 'block' : 'none'" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-keyboard me-2"></i>Keyboard Shortcuts
            </h5>
            <button type="button" class="btn-close" (click)="close()"></button>
          </div>
          <div class="modal-body">
            <div class="row g-4">
              <div class="col-md-6" *ngFor="let group of shortcutGroups">
                <h6 class="text-muted text-uppercase small fw-semibold mb-3">{{ group.title }}</h6>
                <div class="d-flex flex-column gap-2">
                  <div class="d-flex justify-content-between align-items-center" *ngFor="let shortcut of group.shortcuts">
                    <span class="text-muted small">{{ shortcut.description }}</span>
                    <kbd class="kbd">{{ shortcut.keys }}</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer justify-content-between">
            <span class="text-muted small">
              <i class="bi bi-info-circle me-1"></i>Press <kbd class="kbd">?</kbd> anywhere to toggle this help
            </span>
            <button type="button" class="btn btn-secondary" (click)="close()">Close</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade show" *ngIf="isOpen" (click)="close()"></div>
  `,
  styles: [`
    .modal.show { display: block; }

    .kbd {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1;
      color: var(--text-primary);
      background-color: var(--surface-inset);
      border: 1px solid var(--surface-border-strong);
      border-radius: var(--radius-sm);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
      font-family: var(--font-mono);
      white-space: nowrap;
    }

    .modal-body {
      max-height: 70vh;
      overflow-y: auto;
    }
  `]
})
export class KeyboardHelpComponent {
  isOpen = false;

  shortcutGroups: ShortcutGroup[] = [
    {
      title: 'Navigation',
      shortcuts: [
        { keys: '↑ / k', description: 'Move up' },
        { keys: '↓ / j', description: 'Move down' },
        { keys: 'Enter', description: 'Select / Open item' },
        { keys: 'Esc', description: 'Close dialog / Cancel' },
      ]
    },
    {
      title: 'Picking',
      shortcuts: [
        { keys: 'Space', description: 'Quick pick item' },
        { keys: 'Shift + Enter', description: 'Pick with quantity' },
        { keys: 'Ctrl + P', description: 'Print pick list' },
        { keys: 'Ctrl + F', description: 'Focus search' },
      ]
    },
    {
      title: 'General',
      shortcuts: [
        { keys: '?', description: 'Show this help' },
        { keys: 'Ctrl + K', description: 'Global search' },
        { keys: 'Alt + T', description: 'Toggle theme' },
      ]
    },
    {
      title: 'Mobile / Touch',
      shortcuts: [
        { keys: 'Swipe →', description: 'Mark as picked' },
        { keys: 'Swipe ←', description: 'Undo / Skip' },
        { keys: 'Long press', description: 'View details' },
      ]
    }
  ];

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    // Don't trigger if user is typing in an input field
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Press '?' to toggle help
    if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      this.toggle();
    }

    // Press Escape to close
    if (event.key === 'Escape' && this.isOpen) {
      event.preventDefault();
      this.close();
    }
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
  }

  close(): void {
    this.isOpen = false;
  }
}
