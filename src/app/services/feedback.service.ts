import { Injectable } from '@angular/core';

/**
 * Handles haptic feedback and celebration effects for warehouse interactions.
 * Mobile-first: vibration API for tablets/phones in noisy warehouse environments.
 */
@Injectable({
  providedIn: 'root'
})
export class FeedbackService {

  /** Short pulse for successful pick */
  pickSuccess(): void {
    this.vibrate([50]);
  }

  /** Double pulse for undo */
  pickUndo(): void {
    this.vibrate([30, 50, 30]);
  }

  /** Quick pulse for scan */
  scanSuccess(): void {
    this.vibrate([100]);
  }

  /** Error buzz */
  errorBuzz(): void {
    this.vibrate([100, 30, 100]);
  }

  /** Celebration burst for order completion */
  celebrate(): void {
    this.vibrate([50, 30, 50, 30, 100, 50, 200]);
    this.showConfetti();
  }

  /** Show confetti overlay for ~3 seconds */
  private showConfetti(): void {
    // Create confetti container
    const container = document.createElement('div');
    container.className = 'confetti-container';
    container.setAttribute('aria-hidden', 'true');

    // Generate confetti pieces
    const colors = ['#0f766e', '#f59e0b', '#10b981', '#3b82f6', '#f43f5e', '#8b5cf6'];
    const pieceCount = 60;

    for (let i = 0; i < pieceCount; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const delay = Math.random() * 0.5;
      const duration = 2 + Math.random() * 1.5;
      const rotation = Math.random() * 360;
      const size = 6 + Math.random() * 6;

      piece.style.cssText = `
        position: absolute;
        left: ${left}%;
        top: -10px;
        width: ${size}px;
        height: ${size * 0.6}px;
        background: ${color};
        border-radius: 2px;
        animation: confetti-fall ${duration}s ease-in ${delay}s forwards;
        transform: rotate(${rotation}deg);
        opacity: 0.9;
      `;
      container.appendChild(piece);
    }

    document.body.appendChild(container);

    // Clean up after animation
    setTimeout(() => {
      container.remove();
    }, 4000);
  }

  private vibrate(pattern: number[]): void {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Silently fail — not all devices support vibration
      }
    }
  }
}
