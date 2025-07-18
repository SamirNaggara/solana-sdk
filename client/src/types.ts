import z from "zod";
import DppProductSchema from "../SchemaZod";

/** Supported Solana cluster names */
export type NetworkValue = "Mainnet" | "Testnet" | "Devnet";

/** Runtime‑validated shape of a memo object stored on‑chain */
export const SignatureSchema = z.object({
  hash: z.string().min(1, "Hash is required"),
});

export type ProductInput = {
  productUid: string;
  info: z.infer<typeof DppProductSchema>;
};

// Type for the complete product with relations
export type CompleteProduct = {
  id: string;
  productName: string;
  dateOfManufacture: Date;
  placeOfManufacture: string;
  productCategory: string;
  repairabilityScore?: number;
  endOfLifeInstructions: string;
  digitalLink: string;
  signature: string;
  manufacturer: {
    name: string;
    address: string;
    contactEmail: string;
  };
  materialComposition: Array<{
    material: string;
    percentage: number;
  }>;
  hazardousSubstances: Array<{
    substance: string;
    casNumber: string;
    concentration: number;
  }>;
};

export interface MintResult {
  productUid: string;
  signature: string;
  hash: string;
}
