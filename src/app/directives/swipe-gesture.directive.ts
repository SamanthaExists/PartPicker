import { Directive, ElementRef, EventEmitter, OnInit, OnDestroy, Output, Input } from '@angular/core';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

@Directive({
  selector: '[appSwipeGesture]',
  standalone: true
})
export class SwipeGestureDirective implements OnInit, OnDestroy {
  @Input() swipeThreshold = 50; // Minimum distance for swipe
  @Input() swipeTimeout = 500; // Maximum time for swipe in ms
  @Input() swipeDisabled = false;

  @Output() swipeLeft = new EventEmitter<void>();
  @Output() swipeRight = new EventEmitter<void>();
  @Output() swipeUp = new EventEmitter<void>();
  @Output() swipeDown = new EventEmitter<void>();
  @Output() swipe = new EventEmitter<SwipeDirection>();

  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private isSwiping = false;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    const element = this.el.nativeElement;

    element.addEventListener('touchstart', this.onTouchStart, { passive: true });
    element.addEventListener('touchmove', this.onTouchMove, { passive: false });
    element.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  ngOnDestroy(): void {
    const element = this.el.nativeElement;

    element.removeEventListener('touchstart', this.onTouchStart);
    element.removeEventListener('touchmove', this.onTouchMove);
    element.removeEventListener('touchend', this.onTouchEnd);
  }

  private onTouchStart = (e: TouchEvent): void => {
    if (this.swipeDisabled) return;

    const touch = e.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.startTime = Date.now();
    this.isSwiping = true;
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.isSwiping || this.swipeDisabled) return;

    const touch = e.touches[0];
    const deltaX = touch.clientX - this.startX;
    const deltaY = touch.clientY - this.startY;

    // Prevent scrolling if horizontal swipe is detected
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      e.preventDefault();
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (!this.isSwiping || this.swipeDisabled) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - this.startX;
    const deltaY = touch.clientY - this.startY;
    const deltaTime = Date.now() - this.startTime;

    this.isSwiping = false;

    // Check if swipe is valid
    if (deltaTime > this.swipeTimeout) return;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Determine direction
    if (absX > absY && absX > this.swipeThreshold) {
      // Horizontal swipe
      if (deltaX > 0) {
        this.swipeRight.emit();
        this.swipe.emit('right');
      } else {
        this.swipeLeft.emit();
        this.swipe.emit('left');
      }
    } else if (absY > absX && absY > this.swipeThreshold) {
      // Vertical swipe
      if (deltaY > 0) {
        this.swipeDown.emit();
        this.swipe.emit('down');
      } else {
        this.swipeUp.emit();
        this.swipe.emit('up');
      }
    }
  };
}
