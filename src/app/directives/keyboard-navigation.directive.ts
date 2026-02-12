import { Directive, EventEmitter, HostListener, Input, Output, OnDestroy } from '@angular/core';

@Directive({
  selector: '[appKeyboardNavigation]',
  standalone: true
})
export class KeyboardNavigationDirective implements OnDestroy {
  @Input() itemCount = 0;
  @Input() enabled = true;

  @Output() selectedIndexChange = new EventEmitter<number>();
  @Output() actionTriggered = new EventEmitter<number>();

  private currentIndex = -1;

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (!this.enabled || this.itemCount === 0) return;

    // Ignore if user is typing in an input field
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'j':
        event.preventDefault();
        this.moveDown();
        break;

      case 'ArrowUp':
      case 'k':
        event.preventDefault();
        this.moveUp();
        break;

      case 'Enter':
      case ' ':
        if (this.currentIndex >= 0) {
          event.preventDefault();
          this.actionTriggered.emit(this.currentIndex);
        }
        break;

      case 'Escape':
        this.clearSelection();
        break;

      case 'Home':
        event.preventDefault();
        this.goToFirst();
        break;

      case 'End':
        event.preventDefault();
        this.goToLast();
        break;
    }
  }

  ngOnDestroy(): void {
    this.clearSelection();
  }

  private moveDown(): void {
    if (this.currentIndex < this.itemCount - 1) {
      this.currentIndex++;
      this.selectedIndexChange.emit(this.currentIndex);
    }
  }

  private moveUp(): void {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.selectedIndexChange.emit(this.currentIndex);
    } else if (this.currentIndex === -1 && this.itemCount > 0) {
      // If nothing selected, start from the top
      this.currentIndex = 0;
      this.selectedIndexChange.emit(this.currentIndex);
    }
  }

  private goToFirst(): void {
    if (this.itemCount > 0) {
      this.currentIndex = 0;
      this.selectedIndexChange.emit(this.currentIndex);
    }
  }

  private goToLast(): void {
    if (this.itemCount > 0) {
      this.currentIndex = this.itemCount - 1;
      this.selectedIndexChange.emit(this.currentIndex);
    }
  }

  private clearSelection(): void {
    this.currentIndex = -1;
    this.selectedIndexChange.emit(-1);
  }

  // Public method to reset selection
  reset(): void {
    this.clearSelection();
  }

  // Public method to set selection
  setIndex(index: number): void {
    if (index >= -1 && index < this.itemCount) {
      this.currentIndex = index;
    }
  }
}
