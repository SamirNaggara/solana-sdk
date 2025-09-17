import z from "zod";
import DppProductSchema from "../SchemaZod";
import { DPPField, FieldDifference } from "./types";

export class ValidationUtils {
  /**
   * Validates product data using Zod schema
   * @param productData - The product data to validate
   * @throws ZodError if validation fails
   */
  static validateProductData(productData: any): z.infer<typeof DppProductSchema> {
    try {
      return DppProductSchema.parse(productData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw error;
      }
      throw new Error(`Validation failed: ${error}`);
    }
  }

  /**
   * Normalizes user names for consistency
   * @param userName - The user name to normalize
   * @returns Normalized user name (lowercase, trimmed)
   */
  static normalizeUserName(userName?: string): string {
    if (!userName || !userName.trim()) {
      return 'system';
    }
    return userName.trim().toLowerCase();
  }

  /**
   * Create a DPP field with value and accessibility level
   */
  static createDPPField(value: any, accessibilityLevel: 'public' | 'owner' | 'private' = 'public'): DPPField {
    return {
      value,
      accessibilityLevel
    };
  }

  /**
   * Extract value from DPP field based on user access level
   */
  static extractDPPValue(field: DPPField, userAccessLevel: 'public' | 'owner' | 'private' = 'public'): any {
    const accessLevels = ['public', 'owner', 'private'];
    const userLevel = accessLevels.indexOf(userAccessLevel);
    const fieldLevel = accessLevels.indexOf(field.accessibilityLevel);

    // User can access if their level is >= field level
    if (userLevel >= fieldLevel) {
      return field.value;
    }

    return null; // Access denied
  }

  /**
   * Filter product data based on user access level
   */
  static filterProductByAccess(product: any, userAccessLevel: 'public' | 'owner' | 'private' = 'public'): any {
    const filtered: any = {};

    for (const [key, value] of Object.entries(product)) {
      if (value && typeof value === 'object' && 'value' in value && 'accessibilityLevel' in value) {
        // It's a DPP field
        const extractedValue = this.extractDPPValue(value as DPPField, userAccessLevel);
        if (extractedValue !== null) {
          filtered[key] = extractedValue;
        }
      } else if (Array.isArray(value)) {
        // Handle arrays
        filtered[key] = value.map(item =>
          this.filterProductByAccess(item, userAccessLevel)
        ).filter(item => item !== null && typeof item === 'object' ? Object.keys(item).length > 0 : true);
      } else if (value && typeof value === 'object') {
        // Handle nested objects
        const nestedFiltered = this.filterProductByAccess(value, userAccessLevel);
        if (Object.keys(nestedFiltered).length > 0) {
          filtered[key] = nestedFiltered;
        }
      } else {
        // Regular value
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Compare two product objects and return detailed differences
   * @param storedProduct - Product object from database
   * @param providedProduct - Product object provided for verification
   * @returns Array of field differences
   */
  static compareProductObjects(storedProduct: any, providedProduct: any): FieldDifference[] {
    const differences: FieldDifference[] = [];

    this.compareObjectsRecursive(storedProduct, providedProduct, '', differences);

    return differences;
  }

  /**
   * Recursively compare two objects and populate differences array
   */
  private static compareObjectsRecursive(
    stored: any,
    provided: any,
    path: string,
    differences: FieldDifference[]
  ): void {
    // Handle null/undefined cases
    if (stored === null || stored === undefined) {
      if (provided !== null && provided !== undefined) {
        differences.push({
          path,
          storedValue: stored,
          providedValue: provided,
          changeType: 'added'
        });
      }
      return;
    }

    if (provided === null || provided === undefined) {
      differences.push({
        path,
        storedValue: stored,
        providedValue: provided,
        changeType: 'removed'
      });
      return;
    }

    // Handle DPP fields (objects with value and accessibilityLevel)
    if (this.isDPPField(stored) && this.isDPPField(provided)) {
      const storedDPP = stored as DPPField;
      const providedDPP = provided as DPPField;

      if (storedDPP.value !== providedDPP.value) {
        differences.push({
          path: `${path}.value`,
          storedValue: storedDPP.value,
          providedValue: providedDPP.value,
          changeType: 'modified'
        });
      }

      if (storedDPP.accessibilityLevel !== providedDPP.accessibilityLevel) {
        differences.push({
          path: `${path}.accessibilityLevel`,
          storedValue: storedDPP.accessibilityLevel,
          providedValue: providedDPP.accessibilityLevel,
          changeType: 'modified'
        });
      }
      return;
    }

    // Handle arrays
    if (Array.isArray(stored) && Array.isArray(provided)) {
      const maxLength = Math.max(stored.length, provided.length);

      for (let i = 0; i < maxLength; i++) {
        const arrayPath = `${path}[${i}]`;

        if (i >= stored.length) {
          differences.push({
            path: arrayPath,
            storedValue: undefined,
            providedValue: provided[i],
            changeType: 'added'
          });
        } else if (i >= provided.length) {
          differences.push({
            path: arrayPath,
            storedValue: stored[i],
            providedValue: undefined,
            changeType: 'removed'
          });
        } else {
          this.compareObjectsRecursive(stored[i], provided[i], arrayPath, differences);
        }
      }
      return;
    }

    // Handle objects
    if (typeof stored === 'object' && typeof provided === 'object') {
      const allKeys = new Set([...Object.keys(stored), ...Object.keys(provided)]);

      for (const key of allKeys) {
        const nestedPath = path ? `${path}.${key}` : key;

        if (!(key in stored)) {
          differences.push({
            path: nestedPath,
            storedValue: undefined,
            providedValue: provided[key],
            changeType: 'added'
          });
        } else if (!(key in provided)) {
          differences.push({
            path: nestedPath,
            storedValue: stored[key],
            providedValue: undefined,
            changeType: 'removed'
          });
        } else {
          this.compareObjectsRecursive(stored[key], provided[key], nestedPath, differences);
        }
      }
      return;
    }

    // Handle primitive values
    if (stored !== provided) {
      differences.push({
        path,
        storedValue: stored,
        providedValue: provided,
        changeType: 'modified'
      });
    }
  }

  /**
   * Check if an object is a DPP field
   */
  private static isDPPField(obj: any): boolean {
    return obj &&
           typeof obj === 'object' &&
           'value' in obj &&
           'accessibilityLevel' in obj &&
           ['public', 'owner', 'private'].includes(obj.accessibilityLevel);
  }
}
