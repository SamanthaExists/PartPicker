import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export interface ScanResult {
  value: string;
  format: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class BarcodeScannerService {
  private scanSubject = new Subject<ScanResult>();
  private activeSubject = new BehaviorSubject<boolean>(false);
  private supportedSubject = new BehaviorSubject<boolean>(false);
  private errorSubject = new Subject<string>();

  scan$ = this.scanSubject.asObservable();
  active$ = this.activeSubject.asObservable();
  supported$ = this.supportedSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  private stream: MediaStream | null = null;
  private detector: any = null;
  private animationFrameId: number | null = null;
  private videoElement: HTMLVideoElement | null = null;

  constructor(private ngZone: NgZone) {
    this.checkSupport();
  }

  private checkSupport(): void {
    const supported = 'BarcodeDetector' in window;
    this.supportedSubject.next(supported);
  }

  isSupported(): boolean {
    return this.supportedSubject.getValue();
  }

  isActive(): boolean {
    return this.activeSubject.getValue();
  }

  async startScanning(videoEl: HTMLVideoElement): Promise<void> {
    if (this.activeSubject.getValue()) return;

    try {
      // Create detector with common warehouse barcode formats
      const BarcodeDetector = (window as any).BarcodeDetector;
      if (!BarcodeDetector) {
        this.errorSubject.next('BarcodeDetector not available in this browser');
        return;
      }

      this.detector = new BarcodeDetector({
        formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf']
      });

      // Request camera with rear-facing preference (warehouse tablet)
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      this.videoElement = videoEl;
      videoEl.srcObject = this.stream;
      await videoEl.play();

      this.activeSubject.next(true);
      this.startDetectionLoop(videoEl);

    } catch (err: any) {
      const message = err.name === 'NotAllowedError'
        ? 'Camera permission denied. Please allow camera access to scan barcodes.'
        : err.name === 'NotFoundError'
          ? 'No camera found on this device.'
          : `Camera error: ${err.message}`;
      this.errorSubject.next(message);
    }
  }

  private startDetectionLoop(videoEl: HTMLVideoElement): void {
    const detect = async () => {
      if (!this.activeSubject.getValue() || !this.detector) return;

      try {
        const barcodes = await this.detector.detect(videoEl);
        if (barcodes.length > 0) {
          const barcode = barcodes[0];
          this.ngZone.run(() => {
            this.scanSubject.next({
              value: barcode.rawValue,
              format: barcode.format,
              timestamp: new Date()
            });
          });
          // Brief pause after successful scan to avoid duplicates
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (err) {
        // Detection errors are transient (e.g. video not ready), ignore
      }

      if (this.activeSubject.getValue()) {
        this.animationFrameId = requestAnimationFrame(detect);
      }
    };

    this.animationFrameId = requestAnimationFrame(detect);
  }

  stopScanning(): void {
    this.activeSubject.next(false);

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    this.detector = null;
  }

  async toggleTorch(enable: boolean): Promise<void> {
    if (!this.stream) return;
    const track = this.stream.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        await (track as any).applyConstraints({
          advanced: [{ torch: enable } as any]
        });
      } catch {
        // Torch not supported on this device, silently ignore
      }
    }
  }

  vibrate(): void {
    if ('vibrate' in navigator) {
      navigator.vibrate(100);
    }
  }
}
