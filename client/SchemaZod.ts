import { z } from "zod";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/;
const casRegex = /^\d{2,7}-\d{2}-\d$/;

// Schema for DPP Field with accessibility level
const DPPFieldSchema = z.object({
  value: z.any(),
  accessibilityLevel: z.enum(['public', 'owner', 'private'])
});

// Helper function to create a DPP field schema with specific value validation
const createDPPField = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    accessibilityLevel: z.enum(['public', 'owner', 'private'])
  });

const DppProductSchema = z.object({
  // 1) Champs d'origine
  id: createDPPField(z.string().regex(uuidRegex, "id must be a valid UUID")),
  productName: createDPPField(z.string().min(1, "productName is required")),
  dateOfManufacture: createDPPField(z.string().regex(isoDateRegex, "dateOfManufacture must be in ISO format (YYYY-MM-DD)")),
  placeOfManufacture: createDPPField(z.string().min(1, "placeOfManufacture is required")),
  productCategory: createDPPField(z.string().min(1, "productCategory is required")),
  repairabilityScore: createDPPField(z.string().min(1, "repairabilityScore is required")),
  endOfLifeInstructions: createDPPField(z.string().min(10, "Instructions must be sufficiently detailed")),
  digitalLink: createDPPField(z.string().url("digitalLink must be a valid URL")),
  signature: createDPPField(z.string().min(1, "signature is required")),
  hash: createDPPField(z.string().min(1, "hash is required")).optional(),

  manufacturer: z.object({
    name: createDPPField(z.string().min(1, "manufacturer.name is required")),
    address: createDPPField(z.string().min(1, "manufacturer.address is required")),
    contactEmail: createDPPField(z.string().email("manufacturer.contactEmail must be a valid email"))
  }),

  materialComposition: z.array(
    z.object({
      material: createDPPField(z.string().min(1, "material name is required")),
      percentage: createDPPField(z.string().min(1, "percentage is required"))
    })
  ),

  hazardousSubstances: z.array(
    z.object({
      substance: createDPPField(z.string().min(1, "substance is required")),
      casNumber: createDPPField(z.string().regex(casRegex, "CAS number must match format: XX-XX-X")),
      concentration: createDPPField(z.string().min(1, "concentration is required"))
    })
  ),

  // 2) Identification & data carriers
  gtin: createDPPField(z.string().min(1, "GTIN is required")),
  serialNumber: createDPPField(z.string().min(1, "serialNumber is required")),
  model: createDPPField(z.string().min(1, "model is required")),
  batchLot: createDPPField(z.string().min(1, "batchLot is required")),
  dataCarrier: createDPPField(z.enum(["QR", "DataMatrix", "NFC", "RFID"])),
  aidcPayloadMirror: createDPPField(z.string().min(1, "aidcPayloadMirror is required")),

  // 3) Manufacturer (extended)
  manufacturerExtended: z.object({
    gln: createDPPField(z.string().min(1, "GLN is required")),
    website: createDPPField(z.string().url("website must be a valid URL"))
  }),

  // 4) Compliance & safety
  compliance: z.object({
    ceMarking: createDPPField(z.enum(["Yes", "No", "Not provided"])),
    standards: z.array(createDPPField(z.string().min(1, "standard is required"))),
    declarations: z.array(
      z.object({
        type: createDPPField(z.string().min(1, "declaration type is required")),
        url: createDPPField(z.string().url("declaration URL must be valid")),
        validFrom: createDPPField(z.string().regex(isoDateRegex, "validFrom must be ISO date")),
        validTo: createDPPField(z.string().regex(isoDateRegex, "validTo must be ISO date"))
      })
    ),
    certificates: z.array(
      z.object({
        scheme: createDPPField(z.string().min(1, "scheme is required")),
        issuer: createDPPField(z.string().min(1, "issuer is required")),
        certificateId: createDPPField(z.string().min(1, "certificateId is required")),
        url: createDPPField(z.string().url("certificate URL must be valid")),
        validTo: createDPPField(z.string().regex(isoDateRegex, "validTo must be ISO date"))
      })
    )
  }),

  // 5) Composition étendue & criticité
  materialCompositionExtended: z.array(
    z.object({
      material: createDPPField(z.string().min(1, "material is required")),
      percentage: createDPPField(z.string().min(1, "percentage is required")),
      recycledContentPct: createDPPField(z.string().min(1, "recycledContentPct is required")),
      originCountry: createDPPField(z.string().min(1, "originCountry is required")),
      criticalRawMaterial: createDPPField(z.enum(["Yes", "No", "Not provided"]))
    })
  ),

  // 6) Performance, impact & sustainability
  energyEfficiencyClass: createDPPField(z.string().min(1, "energyEfficiencyClass is required")),
  carbonFootprint: z.object({
    standard: createDPPField(z.enum(["PEF", "ISO14067", "Other"])),
    declaredValueKgCO2e: createDPPField(z.string().min(1, "declaredValueKgCO2e is required")),
    systemBoundary: createDPPField(z.string().min(1, "systemBoundary is required")),
    studyUrl: createDPPField(z.string().url("studyUrl must be valid URL"))
  }),
  durabilityMetrics: z.object({
    mtbfHours: createDPPField(z.string().min(1, "mtbfHours is required")),
    warrantyMonths: createDPPField(z.string().min(1, "warrantyMonths is required")),
    expectedLifespanMonths: createDPPField(z.string().min(1, "expectedLifespanMonths is required")),
    sparePartsAvailabilityMonths: createDPPField(z.string().min(1, "sparePartsAvailabilityMonths is required"))
  }),

  // 7) Usage, maintenance & repair
  userManualUrl: createDPPField(z.string().url("userManualUrl must be valid URL")),
  safetyInstructionsUrl: createDPPField(z.string().url("safetyInstructionsUrl must be valid URL")),
  maintenanceGuides: z.array(createDPPField(z.string().url("maintenance guide URL must be valid"))),
  spareParts: z.array(
    z.object({
      partNumber: createDPPField(z.string().min(1, "partNumber is required")),
      name: createDPPField(z.string().min(1, "spare part name is required")),
      compatibilityNotes: createDPPField(z.string().min(1, "compatibilityNotes is required")),
      orderUrl: createDPPField(z.string().url("orderUrl must be valid URL"))
    })
  ),
  serviceCenters: z.array(
    z.object({
      name: createDPPField(z.string().min(1, "service center name is required")),
      gln: createDPPField(z.string().min(1, "GLN is required")),
      country: createDPPField(z.string().min(1, "country is required")),
      contact: createDPPField(z.string().min(1, "contact is required"))
    })
  ),
  lifecycleEvents: z.array(
    z.object({
      eventType: createDPPField(z.string().min(1, "eventType is required")),
      timestamp: createDPPField(z.string().regex(isoDateTimeRegex, "timestamp must be ISO datetime")),
      locationGln: createDPPField(z.string().min(1, "locationGln is required")),
      locationName: createDPPField(z.string().min(1, "locationName is required")),
      actor: createDPPField(z.string().min(1, "actor is required")),
      details: z.record(z.string(), createDPPField(z.any()))
    })
  ),

  // 8) Fin de vie (étendu)
  disassemblyGuideUrl: createDPPField(z.string().url("disassemblyGuideUrl must be valid URL")),
  recyclabilityRatePct: createDPPField(z.string().min(1, "recyclabilityRatePct is required")),
  collectionPointsUrl: createDPPField(z.string().url("collectionPointsUrl must be valid URL")),

  // 9) Données numériques & intégrité
  firmwareVersion: createDPPField(z.string().min(1, "firmwareVersion is required")),
  version: createDPPField(z.string().min(1, "version is required")),
  issuedAt: createDPPField(z.string().regex(isoDateTimeRegex, "issuedAt must be ISO datetime")),
  updatedAt: createDPPField(z.string().regex(isoDateTimeRegex, "updatedAt must be ISO datetime")),

  // 10) Localisation & langues
  languagesAvailable: z.array(createDPPField(z.string().min(1, "language code is required")))
});

export default DppProductSchema;