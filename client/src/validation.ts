import z from "zod";
import DppProductSchema from "../SchemaZod";
import { DPPField } from "./types";

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
        ).filter(item => item !== null);
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
}
