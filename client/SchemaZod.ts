import { z } from "zod";
import { de } from "zod/v4/locales";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const casRegex = /^\d{2,7}-\d{2}-\d$/;

const DppProductSchema = z.object({
  productId: z.string().regex(uuidRegex, {
    message: "productId must be a valid UUID"
  }),

  productName: z.string().min(1, {
    message: "productName is required"
  }),

  manufacturer: z.object({
    name: z.string().min(1, {
      message: "manufacturer.name is required"
    }),
    address: z.string().min(1, {
      message: "manufacturer.address is required"
    }),
    contactEmail: z.string().email({
      message: "manufacturer.contactEmail must be a valid email"
    })
  }),

  dateOfManufacture: z.string().regex(isoDateRegex, {
    message: "dateOfManufacture must be in ISO format (YYYY-MM-DD)"
  }),

  placeOfManufacture: z.string().min(1, {
    message: "placeOfManufacture is required"
  }),

  productCategory: z.string().min(1, {
    message: "productCategory is required"
  }),

  materialComposition: z.array(
    z.object({
      material: z.string().min(1, {
        message: "material name is required"
      }),
      percentage: z.number().min(0).max(100)
    })
  ).refine((materials) => {
    const total = materials.reduce((sum, m) => sum + m.percentage, 0);
    return Math.abs(total - 100) <= 1;
  }, {
    message: "Total material composition must add up to ~100%"
  }),

  hazardousSubstances: z.array(
    z.object({
      substance: z.string().min(1),
      casNumber: z.string().regex(casRegex, {
        message: "CAS number must match format: XX-XX-X"
      }),
      concentration: z.number().min(0)
    })
  ),

  repairabilityScore: z.number().min(0).max(10).optional(),

  endOfLifeInstructions: z.string().min(10, {
    message: "Instructions must be sufficiently detailed"
  }),

  digitalLink: z.string().url({
    message: "digitalLink must be a valid URL"
  })
});

export default DppProductSchema;