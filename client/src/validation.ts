import z from "zod";
import DppProductSchema from "../SchemaZod";

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
}
