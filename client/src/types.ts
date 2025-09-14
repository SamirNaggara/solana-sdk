import z from "zod";
import DppProductSchema from "../SchemaZod";

/** Supported Solana cluster names */
export type NetworkValue = "Mainnet" | "Testnet" | "Devnet";

/** Runtime‑validated shape of a memo object stored on‑chain */
export const SignatureSchema = z.object({
  public: z.string().min(1, "Public hash is required"),
  owner: z.string().min(1, "Owner hash is required"),
  brand: z.string().min(1, "Brand hash is required"),
});

/** Enhanced authenticity check result with complete blockchain proof */
export type AuthenticityResult = {
  isValid: boolean;
  reason?: string;
  signature?: string;
  hashes?: {
    publicHash: string;
    ownerHash: string;
    brandHash: string;
  };
  blockchainData?: {
    memo: any;
    transaction?: string;
    slot?: number;
  };
};

// Digital Product Passport (DPP) Types

// Type for fields with integrated accessibility levels
export type DPPField = {
  value: any;
  accessibilityLevel: 'public' | 'owner' | 'private';
};

// Alias for cleaner type definition
type F = DPPField;

export type CompleteProduct = {
  // 1) Champs d'origine (inchangés sémantiquement)
  id: F;
  productName: F;
  dateOfManufacture: F; // ISO string
  placeOfManufacture: F;
  productCategory: F;
  repairabilityScore: F; // ex: "7/10"
  endOfLifeInstructions: F;
  digitalLink: F;
  signature: F;
  hash?: F; // <-- seul champ optionnel

  manufacturer: {
    name: F;
    address: F;
    contactEmail: F;
  };

  materialComposition: Array<{
    material: F;
    percentage: F; // ex: "50%"
  }>;

  hazardousSubstances: Array<{
    substance: F;
    casNumber: F;
    concentration: F; // ex: "0.01%"
  }>;

  // 2) Identification & data carriers
  gtin: F;
  serialNumber: F;
  model: F;
  batchLot: F;
  dataCarrier: F; // "QR" | "DataMatrix" | "NFC" | "RFID"
  aidcPayloadMirror: F;

  // 3) Manufacturer (extended)
  manufacturerExtended: {
    gln: F;
    website: F;
  };

  // 4) Compliance & safety
  compliance: {
    ceMarking: F; // "Yes" | "No" | "Not provided"
    standards: F[]; // liste de normes (chaque entrée = F)
    declarations: Array<{
      type: F; // "DoC" | "RoHS" | ...
      url: F;
      validFrom: F; // ISO date
      validTo: F; // ISO date
    }>;
    certificates: Array<{
      scheme: F;
      issuer: F;
      certificateId: F;
      url: F;
      validTo: F; // ISO date
    }>;
  };

  // 5) Composition étendue & criticité
  materialCompositionExtended: Array<{
    material: F;
    percentage: F; // "30%"
    recycledContentPct: F; // "30%"
    originCountry: F;
    criticalRawMaterial: F; // "Yes" | "No" | "Not provided"
  }>;

  // 6) Performance, impact & sustainability
  energyEfficiencyClass: F;
  carbonFootprint: {
    standard: F; // "PEF" | "ISO14067" | "Other"
    declaredValueKgCO2e: F; // ex: "12.5 kgCO2e"
    systemBoundary: F;
    studyUrl: F;
  };
  durabilityMetrics: {
    mtbfHours: F; // ex: "20000h"
    warrantyMonths: F; // ex: "24"
    expectedLifespanMonths: F; // ex: "120"
    sparePartsAvailabilityMonths: F;
  };

  // 7) Usage, maintenance & repair
  userManualUrl: F;
  safetyInstructionsUrl: F;
  maintenanceGuides: F[]; // URLs
  spareParts: Array<{
    partNumber: F;
    name: F;
    compatibilityNotes: F;
    orderUrl: F;
  }>;
  serviceCenters: Array<{
    name: F;
    gln: F;
    country: F;
    contact: F;
  }>;
  lifecycleEvents: Array<{
    eventType: F; // "ship" | "repair" | ...
    timestamp: F; // ISO datetime
    locationGln: F;
    locationName: F;
    actor: F;
    details: Record<string, F>; // clés libres, chaque valeur protégée
  }>;

  // 8) Fin de vie (étendu)
  disassemblyGuideUrl: F;
  recyclabilityRatePct: F; // ex: "80%"
  collectionPointsUrl: F;

  // 9) Données numériques & intégrité
  firmwareVersion: F;
  version: F;
  issuedAt: F; // ISO datetime
  updatedAt: F; // ISO datetime

  // 10) Localisation & langues
  languagesAvailable: F[]; // ex: ["en","fr","de"] (chaque entrée = F)
};

export type ProductInput = {
  productUid: string;
  info: z.infer<typeof DppProductSchema>;
};

export interface MintResult {
  productUid: string;
  signature: string;
  hash: string;
}
