import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { BarcodeScannerService, ScanResult } from '../../services/barcode-scanner.service';
import { PartsCatalogService } from '../../services/parts-catalog.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Floating Action Button -->
    <button
      *ngIf="isSupported && !isScanning"
      class="barcode-fab"
      (click)="openScanner()"
      title="Scan barcode (Alt+S)"
      aria-label="Scan barcode">
      <i class="bi bi-upc-scan"></i>
    </button>

    <!-- Scanner Overlay -->
    <div class="scanner-overlay" *ngIf="isScanning" (click)="onOverlayClick($event)">
      <div class="scanner-container" (click)="$event.stopPropagation()">
        <div class="scanner-header">
          <h5 class="scanner-title">
            <i class="bi bi-upc-scan"></i> Scan Barcode
          </h5>
          <div class="scanner-actions">
            <button class="scanner-btn" (click)="toggleTorch()" title="Toggle flashlight">
              <i class="bi" [ngClass]="torchOn ? 'bi-lightbulb-fill' : 'bi-lightbulb'"></i>
            </button>
            <button class="scanner-btn scanner-btn-close" (click)="closeScanner()">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        <div class="scanner-viewport">
          <video #videoEl autoplay playsinline muted class="scanner-video"></video>
          <div class="scanner-reticle">
            <div class="reticle-corner reticle-tl"></div>
            <div class="reticle-corner reticle-tr"></div>
            <div class="reticle-corner reticle-bl"></div>
            <div class="reticle-corner reticle-br"></div>
            <div class="reticle-line"></div>
          </div>
        </div>

        <div class="scanner-footer">
          <p class="scanner-hint" *ngIf="!lastScan">Point camera at a barcode</p>

          <!-- Scan Result -->
          <div class="scan-result" *ngIf="lastScan">
            <div class="scan-result-header">
              <i class="bi bi-check-circle-fill scan-result-icon"></i>
              <span class="scan-result-value">{{ lastScan.value }}</span>
            </div>
            <div class="scan-result-details" *ngIf="matchedPart">
              <div class="scan-result-part">{{ matchedPart.description || matchedPart.part_number }}</div>
              <div class="scan-result-location" *ngIf="matchedPart.default_location">
                <i class="bi bi-geo-alt"></i> {{ matchedPart.default_location }}
              </div>
            </div>
            <div class="scan-result-notfound" *ngIf="lastScan && !matchedPart">
              Part not found in catalog
            </div>
            <div class="scan-result-actions">
              <button class="btn btn-sm btn-outline-light" (click)="scanAgain()">
                <i class="bi bi-arrow-repeat"></i> Scan Again
              </button>
              <button class="btn btn-sm btn-primary" *ngIf="matchedPart" (click)="viewPart()">
                <i class="bi bi-eye"></i> View Part
              </button>
            </div>
          </div>

          <div class="scanner-error" *ngIf="error">
            <i class="bi bi-exclamation-triangle"></i> {{ error }}
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Floating Action Button */
    .barcode-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 1000;
      width: 56px;
      height: 56px;
      border-radius: 16px;
      border: none;
      background: linear-gradient(135deg, var(--primary-color, #0f766e), var(--primary-light, #14b8a6));
      color: white;
      font-size: 1.4rem;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(15, 118, 110, 0.4);
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .barcode-fab:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(15, 118, 110, 0.5);
    }
    .barcode-fab:active {
      transform: translateY(0);
    }

    @media (max-width: 768px) {
      .barcode-fab {
        bottom: 80px;
        right: 16px;
      }
    }

    /* Scanner Overlay */
    .scanner-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.2s ease;
    }

    .scanner-container {
      width: 100%;
      max-width: 480px;
      margin: 16px;
      border-radius: 16px;
      overflow: hidden;
      background: #1a1a2e;
      box-shadow: 0 24px 48px rgba(0,0,0,0.5);
    }

    .scanner-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #16213e;
    }

    .scanner-title {
      margin: 0;
      color: white;
      font-size: 1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .scanner-actions {
      display: flex;
      gap: 8px;
    }

    .scanner-btn {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.15);
      background: transparent;
      color: rgba(255,255,255,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s;
    }
    .scanner-btn:hover {
      background: rgba(255,255,255,0.1);
      color: white;
    }
    .scanner-btn-close:hover {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
      border-color: rgba(239, 68, 68, 0.3);
    }

    /* Camera Viewport */
    .scanner-viewport {
      position: relative;
      width: 100%;
      aspect-ratio: 4/3;
      background: #000;
      overflow: hidden;
    }

    .scanner-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* Scanning Reticle */
    .scanner-reticle {
      position: absolute;
      inset: 20%;
      pointer-events: none;
    }

    .reticle-corner {
      position: absolute;
      width: 24px;
      height: 24px;
      border-color: var(--primary-light, #14b8a6);
      border-style: solid;
      border-width: 0;
    }
    .reticle-tl { top: 0; left: 0; border-top-width: 3px; border-left-width: 3px; border-radius: 4px 0 0 0; }
    .reticle-tr { top: 0; right: 0; border-top-width: 3px; border-right-width: 3px; border-radius: 0 4px 0 0; }
    .reticle-bl { bottom: 0; left: 0; border-bottom-width: 3px; border-left-width: 3px; border-radius: 0 0 0 4px; }
    .reticle-br { bottom: 0; right: 0; border-bottom-width: 3px; border-right-width: 3px; border-radius: 0 0 4px 0; }

    .reticle-line {
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--primary-light, #14b8a6), transparent);
      animation: scanLine 2s ease-in-out infinite;
    }

    @keyframes scanLine {
      0%, 100% { top: 20%; opacity: 0.5; }
      50% { top: 80%; opacity: 1; }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Footer */
    .scanner-footer {
      padding: 16px;
      text-align: center;
    }

    .scanner-hint {
      color: rgba(255,255,255,0.5);
      margin: 0;
      font-size: 0.85rem;
    }

    .scan-result {
      animation: fadeIn 0.3s ease;
    }

    .scan-result-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .scan-result-icon {
      color: #22c55e;
      font-size: 1.2rem;
    }

    .scan-result-value {
      color: white;
      font-weight: 700;
      font-family: var(--font-mono, monospace);
      font-size: 1.1rem;
    }

    .scan-result-details {
      margin-bottom: 12px;
    }

    .scan-result-part {
      color: rgba(255,255,255,0.8);
      font-size: 0.9rem;
    }

    .scan-result-location {
      color: var(--primary-light, #14b8a6);
      font-size: 0.85rem;
      margin-top: 4px;
    }

    .scan-result-notfound {
      color: #fbbf24;
      font-size: 0.85rem;
      margin-bottom: 12px;
    }

    .scan-result-actions {
      display: flex;
      gap: 8px;
      justify-content: center;
    }

    .scanner-error {
      color: #ef4444;
      font-size: 0.85rem;
      margin-top: 8px;
    }
  `]
})
export class BarcodeScannerComponent implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;

  isSupported = false;
  isScanning = false;
  torchOn = false;
  lastScan: ScanResult | null = null;
  matchedPart: any = null;
  error: string | null = null;

  private subs: Subscription[] = [];

  constructor(
    private scanner: BarcodeScannerService,
    private partsCatalog: PartsCatalogService,
    private toast: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.subs.push(
      this.scanner.supported$.subscribe(s => this.isSupported = s),
      this.scanner.scan$.subscribe(result => this.onScanResult(result)),
      this.scanner.error$.subscribe(err => this.error = err)
    );

    // Keyboard shortcut: Alt+S to open scanner
    document.addEventListener('keydown', this.onKeyDown);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.closeScanner();
    document.removeEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey && e.key === 's') {
      e.preventDefault();
      if (this.isScanning) {
        this.closeScanner();
      } else {
        this.openScanner();
      }
    }
    if (e.key === 'Escape' && this.isScanning) {
      this.closeScanner();
    }
  };

  async openScanner(): Promise<void> {
    this.isScanning = true;
    this.lastScan = null;
    this.matchedPart = null;
    this.error = null;

    // Wait for view to render
    await new Promise(r => setTimeout(r, 50));

    if (this.videoRef) {
      await this.scanner.startScanning(this.videoRef.nativeElement);
    }
  }

  closeScanner(): void {
    this.scanner.stopScanning();
    this.isScanning = false;
    this.torchOn = false;
  }

  onOverlayClick(event: MouseEvent): void {
    // Close when clicking outside the scanner container
    if ((event.target as Element).classList.contains('scanner-overlay')) {
      this.closeScanner();
    }
  }

  async toggleTorch(): Promise<void> {
    this.torchOn = !this.torchOn;
    await this.scanner.toggleTorch(this.torchOn);
  }

  scanAgain(): void {
    this.lastScan = null;
    this.matchedPart = null;
    this.error = null;
  }

  viewPart(): void {
    this.closeScanner();
    this.router.navigate(['/parts-catalog'], {
      queryParams: { search: this.matchedPart?.part_number }
    });
  }

  private onScanResult(result: ScanResult): void {
    this.lastScan = result;
    this.scanner.vibrate();

    // Look up the scanned value in parts catalog
    const parts = this.partsCatalog.getCurrentParts();
    const scannedValue = result.value.trim().toUpperCase();

    this.matchedPart = parts.find(p =>
      p.part_number.toUpperCase() === scannedValue ||
      p.part_number.toUpperCase().includes(scannedValue) ||
      scannedValue.includes(p.part_number.toUpperCase())
    ) || null;

    if (this.matchedPart) {
      this.toast.success(`Found: ${this.matchedPart.part_number}`, 3000);
    }
  }
}
