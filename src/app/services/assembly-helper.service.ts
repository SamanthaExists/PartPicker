import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { PartsService } from './parts.service';
import { PartRelationshipsService } from './part-relationships.service';
import { LineItem, Part } from '../models';

/**
 * Unified assembly information combining structured and legacy data sources
 */
export interface AssemblyInfo {
  assemblyPartNumber: string;
  assemblyDescription: string | null;
  componentCount: number;
  components: AssemblyComponent[];
  source: 'structured' | 'legacy';
  isComplete: boolean; // true if we have full component details
}

export interface AssemblyComponent {
  partNumber: string;
  description: string | null;
  quantity: number;
  level: number; // 1 = direct child, 2+ = nested
  referenceDesignator?: string | null;
  notes?: string | null;
}

/**
 * Assembly Helper Service
 *
 * Provides unified access to assembly data from both:
 * - Structured system: parts table + part_relationships table (preferred)
 * - Legacy system: assembly_group text field (fallback)
 *
 * The service gracefully handles both data sources and indicates which source was used.
 */
@Injectable({
  providedIn: 'root'
})
export class AssemblyHelperService {

  constructor(
    private partsService: PartsService,
    private partRelationshipsService: PartRelationshipsService
  ) {}

  /**
   * Get assembly information for a line item.
   * Tries structured system first (via part_id), falls back to legacy assembly_group text parsing.
   *
   * @param lineItem - The line item to get assembly info for
   * @returns Observable<AssemblyInfo | null> - Assembly info or null if not an assembly
   */
  getAssemblyInfo(lineItem: LineItem): Observable<AssemblyInfo | null> {
    // Try structured system first if part_id exists
    if (lineItem.part_id) {
      return this.getStructuredAssemblyInfo(lineItem.part_id, lineItem.part_number, lineItem.description).pipe(
        catchError(error => {
          console.warn(`Failed to get structured assembly info for ${lineItem.part_number}:`, error);
          // Fall back to legacy system
          return this.parseLegacyAssemblyGroup(lineItem);
        })
      );
    }

    // Fall back to legacy system if no part_id
    return this.parseLegacyAssemblyGroup(lineItem);
  }

  /**
   * Get assembly info from structured parts system.
   * Fetches the part and its relationships from the database.
   *
   * @param partId - The part ID from the parts table
   * @param partNumber - Part number (for fallback display)
   * @param description - Description (for fallback display)
   * @returns Observable<AssemblyInfo | null>
   */
  private getStructuredAssemblyInfo(
    partId: string,
    partNumber: string,
    description: string | null
  ): Observable<AssemblyInfo | null> {
    // Fetch the part with its relationships
    return new Observable<AssemblyInfo | null>(observer => {
      this.partsService.getPartWithRelationships(partId).then(partWithRels => {
        if (!partWithRels) {
          observer.next(null);
          observer.complete();
          return;
        }

        // Check if this is an assembly (has children)
        if (!partWithRels.children || partWithRels.children.length === 0) {
          observer.next(null);
          observer.complete();
          return;
        }

        // Map children to components
        const components: AssemblyComponent[] = partWithRels.children.map(child => ({
          partNumber: child.part.part_number,
          description: child.part.description,
          quantity: child.quantity,
          level: 1, // Direct children are level 1
          referenceDesignator: child.reference_designator,
          notes: child.notes
        }));

        const assemblyInfo: AssemblyInfo = {
          assemblyPartNumber: partWithRels.part_number,
          assemblyDescription: partWithRels.description,
          componentCount: components.length,
          components: components,
          source: 'structured',
          isComplete: true
        };

        observer.next(assemblyInfo);
        observer.complete();
      }).catch(error => {
        observer.error(error);
      });
    });
  }

  /**
   * Parse legacy assembly_group text field.
   * Format: "CHILD < PARENT1 < PARENT2" (reads right-to-left, < means "is a child of")
   *
   * @param lineItem - The line item with assembly_group text
   * @returns Observable<AssemblyInfo | null>
   */
  private parseLegacyAssemblyGroup(lineItem: LineItem): Observable<AssemblyInfo | null> {
    if (!lineItem.assembly_group) {
      return of(null);
    }

    // Parse the assembly_group string
    // Format: "CHILD < PARENT1 < PARENT2" (reads right-to-left)
    const parts = lineItem.assembly_group.split('<').map(p => p.trim());

    if (parts.length <= 1) {
      // Not a hierarchical assembly (or only one part)
      return of(null);
    }

    // The rightmost part is the top-level assembly
    const topLevelAssembly = parts[parts.length - 1];

    // The leftmost part is the component we're looking at (lineItem.part_number)
    const componentPart = parts[0];

    // Calculate level: how many levels deep is this component?
    // Level 1 = direct child of top assembly
    // Level 2+ = nested deeper
    const level = parts.length - 1;

    // For legacy system, we can only identify the immediate parent-child relationship
    // We don't have full component list unless we query other line items
    const components: AssemblyComponent[] = [{
      partNumber: componentPart,
      description: lineItem.description,
      quantity: lineItem.qty_per_unit, // Assume qty_per_unit represents quantity in assembly
      level: level
    }];

    const assemblyInfo: AssemblyInfo = {
      assemblyPartNumber: topLevelAssembly,
      assemblyDescription: null, // We don't have assembly description in legacy format
      componentCount: 1, // We only know about this one component
      components: components,
      source: 'legacy',
      isComplete: false // Legacy format only shows partial hierarchy
    };

    return of(assemblyInfo);
  }

  /**
   * Get all components for an assembly, including nested children.
   * Only works with structured system (requires part_id).
   *
   * @param partId - The part ID of the assembly
   * @returns Observable<AssemblyComponent[]>
   */
  getExplodedComponents(partId: string): Observable<AssemblyComponent[]> {
    return new Observable<AssemblyComponent[]>(observer => {
      this.partsService.getExplodedBOM(partId).then(explodedParts => {
        const components: AssemblyComponent[] = explodedParts.map(exploded => ({
          partNumber: exploded.part_number,
          description: exploded.description,
          quantity: exploded.total_quantity,
          level: exploded.max_level
        }));

        observer.next(components);
        observer.complete();
      }).catch(error => {
        console.error('Error getting exploded components:', error);
        observer.next([]);
        observer.complete();
      });
    });
  }

  /**
   * Check if a line item represents an assembly (has child components).
   *
   * @param lineItem - The line item to check
   * @returns Observable<boolean>
   */
  isAssembly(lineItem: LineItem): Observable<boolean> {
    return this.getAssemblyInfo(lineItem).pipe(
      map(info => info !== null && info.componentCount > 0)
    );
  }

  /**
   * Get a summary string describing the assembly structure.
   *
   * @param assemblyInfo - The assembly info
   * @returns A human-readable summary string
   */
  getAssemblySummary(assemblyInfo: AssemblyInfo): string {
    if (!assemblyInfo) {
      return '';
    }

    const sourceLabel = assemblyInfo.source === 'structured' ? 'Full BOM' : 'Partial BOM';
    const completeLabel = assemblyInfo.isComplete ? 'complete' : 'partial';

    if (assemblyInfo.componentCount === 1) {
      return `${sourceLabel} - 1 component (${completeLabel})`;
    }

    return `${sourceLabel} - ${assemblyInfo.componentCount} components (${completeLabel})`;
  }
}
