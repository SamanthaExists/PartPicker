import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface BarChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bar-chart-container" [class.horizontal]="orientation === 'horizontal'">
      <svg [attr.viewBox]="viewBox" preserveAspectRatio="xMidYMid meet" class="bar-chart-svg">
        <defs>
          <linearGradient id="barGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:var(--brand-primary);stop-opacity:1" />
            <stop offset="100%" style="stop-color:var(--brand-primary-hover);stop-opacity:1" />
          </linearGradient>
        </defs>

        <!-- Vertical Bar Chart -->
        <g *ngIf="orientation === 'vertical'">
          <!-- Grid lines -->
          <line *ngFor="let line of gridLines" 
                [attr.x1]="padding" 
                [attr.y1]="line" 
                [attr.x2]="width - padding" 
                [attr.y2]="line" 
                stroke="var(--surface-border)" 
                stroke-width="1" 
                opacity="0.5"/>
          
          <!-- Bars -->
          <g *ngFor="let point of dataPoints; let i = index">
            <rect [attr.x]="getBarX(i)" 
                  [attr.y]="getBarY(point.value)" 
                  [attr.width]="barWidth" 
                  [attr.height]="getBarHeight(point.value)"
                  [attr.fill]="point.color || 'url(#barGradient)'"
                  rx="4"
                  class="bar"
                  (mouseenter)="hoveredIndex = i"
                  (mouseleave)="hoveredIndex = null">
              <title>{{ point.label }}: {{ point.value }}</title>
            </rect>
            
            <!-- Value label on top of bar -->
            <text *ngIf="showValues && point.value > 0"
                  [attr.x]="getBarX(i) + barWidth / 2" 
                  [attr.y]="getBarY(point.value) - 8"
                  text-anchor="middle"
                  class="value-label">
              {{ point.value }}
            </text>
            
            <!-- X-axis label -->
            <text [attr.x]="getBarX(i) + barWidth / 2" 
                  [attr.y]="height - padding + 20"
                  text-anchor="middle"
                  class="axis-label">
              {{ point.label }}
            </text>
          </g>
          
          <!-- Y-axis -->
          <line [attr.x1]="padding" 
                [attr.y1]="padding" 
                [attr.x2]="padding" 
                [attr.y2]="height - padding" 
                stroke="var(--surface-border-strong)" 
                stroke-width="2"/>
          
          <!-- X-axis -->
          <line [attr.x1]="padding" 
                [attr.y1]="height - padding" 
                [attr.x2]="width - padding" 
                [attr.y2]="height - padding" 
                stroke="var(--surface-border-strong)" 
                stroke-width="2"/>
        </g>

        <!-- Horizontal Bar Chart -->
        <g *ngIf="orientation === 'horizontal'">
          <!-- Grid lines -->
          <line *ngFor="let line of gridLinesHorizontal" 
                [attr.x1]="line" 
                [attr.y1]="paddingTop" 
                [attr.x2]="line" 
                [attr.y2]="height - paddingBottom" 
                stroke="var(--surface-border)" 
                stroke-width="1" 
                opacity="0.5"/>
          
          <!-- Bars -->
          <g *ngFor="let point of dataPoints; let i = index">
            <rect [attr.x]="paddingLeft" 
                  [attr.y]="getHorizontalBarY(i)" 
                  [attr.width]="getHorizontalBarWidth(point.value)" 
                  [attr.height]="horizontalBarHeight"
                  [attr.fill]="point.color || 'url(#barGradient)'"
                  rx="4"
                  class="bar"
                  (mouseenter)="hoveredIndex = i"
                  (mouseleave)="hoveredIndex = null">
              <title>{{ point.label }}: {{ point.value }}</title>
            </rect>
            
            <!-- Value label at end of bar -->
            <text *ngIf="showValues && point.value > 0"
                  [attr.x]="paddingLeft + getHorizontalBarWidth(point.value) + 8" 
                  [attr.y]="getHorizontalBarY(i) + horizontalBarHeight / 2"
                  alignment-baseline="middle"
                  class="value-label">
              {{ point.value }}
            </text>
            
            <!-- Y-axis label -->
            <text [attr.x]="paddingLeft - 10" 
                  [attr.y]="getHorizontalBarY(i) + horizontalBarHeight / 2"
                  text-anchor="end"
                  alignment-baseline="middle"
                  class="axis-label">
              {{ point.label }}
            </text>
          </g>
          
          <!-- X-axis -->
          <line [attr.x1]="paddingLeft" 
                [attr.y1]="height - paddingBottom" 
                [attr.x2]="width - paddingRight" 
                [attr.y2]="height - paddingBottom" 
                stroke="var(--surface-border-strong)" 
                stroke-width="2"/>
        </g>
      </svg>
    </div>
  `,
  styles: [`
    .bar-chart-container {
      width: 100%;
      height: 100%;
      min-height: 250px;
    }

    .bar-chart-container.horizontal {
      min-height: 200px;
    }

    .bar-chart-svg {
      width: 100%;
      height: 100%;
    }

    .bar {
      transition: opacity 150ms ease;
      cursor: pointer;
    }

    .bar:hover {
      opacity: 0.8;
    }

    .value-label {
      font-size: 12px;
      font-weight: 600;
      fill: var(--text-primary);
    }

    .axis-label {
      font-size: 11px;
      fill: var(--text-muted);
      font-weight: 500;
    }
  `]
})
export class BarChartComponent {
  @Input() data: BarChartDataPoint[] = [];
  @Input() orientation: 'vertical' | 'horizontal' = 'vertical';
  @Input() showValues = true;
  @Input() height = 300;
  @Input() width = 600;

  hoveredIndex: number | null = null;

  // Padding for vertical charts
  padding = 50;

  // Padding for horizontal charts
  paddingLeft = 100;
  paddingRight = 60;
  paddingTop = 20;
  paddingBottom = 40;

  get viewBox(): string {
    return `0 0 ${this.width} ${this.height}`;
  }

  get dataPoints(): BarChartDataPoint[] {
    return this.data.length > 0 ? this.data : [];
  }

  get maxValue(): number {
    const max = Math.max(...this.dataPoints.map(d => d.value), 0);
    return max > 0 ? max : 10; // Minimum scale
  }

  get chartHeight(): number {
    return this.height - this.padding * 2;
  }

  get chartWidth(): number {
    return this.width - this.padding * 2;
  }

  get horizontalChartWidth(): number {
    return this.width - this.paddingLeft - this.paddingRight;
  }

  get horizontalChartHeight(): number {
    return this.height - this.paddingTop - this.paddingBottom;
  }

  get barWidth(): number {
    const count = this.dataPoints.length || 1;
    const spacing = 0.2; // 20% gap between bars
    return (this.chartWidth / count) * (1 - spacing);
  }

  get barSpacing(): number {
    const count = this.dataPoints.length || 1;
    return this.chartWidth / count;
  }

  get horizontalBarHeight(): number {
    const count = this.dataPoints.length || 1;
    const spacing = 0.3; // 30% gap between bars
    return (this.horizontalChartHeight / count) * (1 - spacing);
  }

  get horizontalBarSpacing(): number {
    const count = this.dataPoints.length || 1;
    return this.horizontalChartHeight / count;
  }

  get gridLines(): number[] {
    const lines: number[] = [];
    const lineCount = 5;
    for (let i = 0; i <= lineCount; i++) {
      lines.push(this.padding + (this.chartHeight / lineCount) * i);
    }
    return lines;
  }

  get gridLinesHorizontal(): number[] {
    const lines: number[] = [];
    const lineCount = 5;
    for (let i = 0; i <= lineCount; i++) {
      lines.push(this.paddingLeft + (this.horizontalChartWidth / lineCount) * i);
    }
    return lines;
  }

  getBarX(index: number): number {
    return this.padding + (this.barSpacing * index) + (this.barSpacing - this.barWidth) / 2;
  }

  getBarY(value: number): number {
    const ratio = value / this.maxValue;
    return this.padding + this.chartHeight * (1 - ratio);
  }

  getBarHeight(value: number): number {
    const ratio = value / this.maxValue;
    return this.chartHeight * ratio;
  }

  getHorizontalBarY(index: number): number {
    return this.paddingTop + (this.horizontalBarSpacing * index) + (this.horizontalBarSpacing - this.horizontalBarHeight) / 2;
  }

  getHorizontalBarWidth(value: number): number {
    const ratio = value / this.maxValue;
    return this.horizontalChartWidth * ratio;
  }
}
