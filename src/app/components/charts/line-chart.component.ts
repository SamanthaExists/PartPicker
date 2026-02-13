import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface LineChartDataPoint {
  label: string;
  value: number;
}

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="line-chart-container">
      <svg [attr.viewBox]="viewBox" preserveAspectRatio="xMidYMid meet" class="line-chart-svg">
        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:var(--brand-primary);stop-opacity:0.3" />
            <stop offset="100%" style="stop-color:var(--brand-primary);stop-opacity:0.05" />
          </linearGradient>
        </defs>

        <!-- Grid lines -->
        <g class="grid">
          <line *ngFor="let y of yGridLines" 
                [attr.x1]="paddingLeft" 
                [attr.y1]="y" 
                [attr.x2]="width - paddingRight" 
                [attr.y2]="y" 
                stroke="var(--surface-border)" 
                stroke-width="1" 
                opacity="0.5"/>
          <text *ngFor="let y of yGridLines; let i = index"
                [attr.x]="paddingLeft - 10" 
                [attr.y]="y + 4"
                text-anchor="end"
                class="grid-label">
            {{ getYLabel(i) }}
          </text>
        </g>

        <!-- Area fill -->
        <path *ngIf="areaPath" 
              [attr.d]="areaPath" 
              fill="url(#areaGradient)"
              opacity="0.8"/>

        <!-- Line -->
        <path *ngIf="linePath" 
              [attr.d]="linePath" 
              fill="none"
              stroke="var(--brand-primary)"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"/>

        <!-- Data points -->
        <g *ngFor="let point of chartPoints; let i = index">
          <circle [attr.cx]="point.x" 
                  [attr.cy]="point.y" 
                  r="5"
                  fill="var(--brand-primary)"
                  stroke="var(--surface-card)"
                  stroke-width="2"
                  class="data-point"
                  (mouseenter)="hoveredIndex = i"
                  (mouseleave)="hoveredIndex = null">
            <title>{{ dataPoints[i].label }}: {{ dataPoints[i].value }}%</title>
          </circle>
          
          <!-- Hover highlight -->
          <circle *ngIf="hoveredIndex === i"
                  [attr.cx]="point.x" 
                  [attr.cy]="point.y" 
                  r="8"
                  fill="none"
                  stroke="var(--brand-primary)"
                  stroke-width="2"
                  opacity="0.5"/>
        </g>

        <!-- X-axis labels (show every other day for 14-day chart) -->
        <g class="x-axis-labels">
          <ng-container *ngFor="let point of chartPoints; let i = index">
            <text *ngIf="i % 2 === 0 || i === chartPoints.length - 1"
                  [attr.x]="point.x" 
                  [attr.y]="height - paddingBottom + 20"
                  text-anchor="middle"
                  class="axis-label">
              {{ getXLabel(i) }}
            </text>
          </ng-container>
        </g>

        <!-- Axes -->
        <line [attr.x1]="paddingLeft" 
              [attr.y1]="paddingTop" 
              [attr.x2]="paddingLeft" 
              [attr.y2]="height - paddingBottom" 
              stroke="var(--surface-border-strong)" 
              stroke-width="2"/>
        
        <line [attr.x1]="paddingLeft" 
              [attr.y1]="height - paddingBottom" 
              [attr.x2]="width - paddingRight" 
              [attr.y2]="height - paddingBottom" 
              stroke="var(--surface-border-strong)" 
              stroke-width="2"/>
      </svg>
    </div>
  `,
  styles: [`
    .line-chart-container {
      width: 100%;
      height: 100%;
      min-height: 250px;
    }

    .line-chart-svg {
      width: 100%;
      height: 100%;
    }

    .data-point {
      transition: r 150ms ease;
      cursor: pointer;
    }

    .data-point:hover {
      r: 7;
    }

    .grid-label,
    .axis-label {
      font-size: 11px;
      fill: var(--text-muted);
      font-weight: 500;
    }
  `]
})
export class LineChartComponent {
  @Input() data: LineChartDataPoint[] = [];
  @Input() height = 300;
  @Input() width = 600;
  @Input() minValue = 0;
  @Input() maxValue = 100;

  hoveredIndex: number | null = null;

  paddingLeft = 50;
  paddingRight = 30;
  paddingTop = 30;
  paddingBottom = 40;

  get viewBox(): string {
    return `0 0 ${this.width} ${this.height}`;
  }

  get dataPoints(): LineChartDataPoint[] {
    return this.data.length > 0 ? this.data : [];
  }

  get chartWidth(): number {
    return this.width - this.paddingLeft - this.paddingRight;
  }

  get chartHeight(): number {
    return this.height - this.paddingTop - this.paddingBottom;
  }

  get yGridLines(): number[] {
    const lines: number[] = [];
    const lineCount = 5;
    for (let i = 0; i <= lineCount; i++) {
      lines.push(this.paddingTop + (this.chartHeight / lineCount) * i);
    }
    return lines;
  }

  get chartPoints(): { x: number; y: number }[] {
    if (this.dataPoints.length === 0) return [];

    return this.dataPoints.map((point, index) => {
      const x = this.paddingLeft + (this.chartWidth / (this.dataPoints.length - 1 || 1)) * index;
      const ratio = (point.value - this.minValue) / (this.maxValue - this.minValue);
      const y = this.paddingTop + this.chartHeight * (1 - ratio);
      return { x, y };
    });
  }

  get linePath(): string {
    if (this.chartPoints.length === 0) return '';

    let path = `M ${this.chartPoints[0].x} ${this.chartPoints[0].y}`;
    
    for (let i = 1; i < this.chartPoints.length; i++) {
      const point = this.chartPoints[i];
      path += ` L ${point.x} ${point.y}`;
    }

    return path;
  }

  get areaPath(): string {
    if (this.chartPoints.length === 0) return '';

    const baseY = this.height - this.paddingBottom;
    
    let path = `M ${this.chartPoints[0].x} ${baseY}`;
    path += ` L ${this.chartPoints[0].x} ${this.chartPoints[0].y}`;
    
    for (let i = 1; i < this.chartPoints.length; i++) {
      const point = this.chartPoints[i];
      path += ` L ${point.x} ${point.y}`;
    }
    
    const lastPoint = this.chartPoints[this.chartPoints.length - 1];
    path += ` L ${lastPoint.x} ${baseY}`;
    path += ' Z';

    return path;
  }

  getYLabel(index: number): string {
    const lineCount = 5;
    const value = this.maxValue - (this.maxValue - this.minValue) / lineCount * index;
    return Math.round(value) + '%';
  }

  getXLabel(index: number): string {
    if (index >= this.dataPoints.length) return '';
    const label = this.dataPoints[index].label;
    // Extract day and month from YYYY-MM-DD
    const parts = label.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}`;
    }
    return label;
  }
}
