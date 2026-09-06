# solana-dpp

[![CI](https://github.com/SamirNaggara/solana-sdk/actions/workflows/test.yml/badge.svg)](https://github.com/SamirNaggara/solana-sdk/actions/workflows/test.yml) [![npm](https://img.shields.io/npm/v/solana-dpp)](https://www.npmjs.com/package/solana-dpp) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**TypeScript SDK for creating and managing Digital Product Passports (DPP) on Solana, with hashed metadata on-chain and PostgreSQL storage off-chain.**

Fully open source, MIT licensed. Born at [Safeout](https://www.linkedin.com/company/safeout-official) in 2025, where it powered product authentication on Solana. Its development was supported by a Solana grant, which is why it is published here in full.

**Authors:** [Samir Naggara](https://github.com/SamirNaggara) and [Axel Giguaire](https://github.com/MrFeuylle).

## In five lines

```typescript
import { SolanaDppSdk } from 'solana-dpp';

const sdk = new SolanaDppSdk();
await sdk.init({ databaseUrl: process.env.DATABASE_URL!, rpcUrl: 'https://api.devnet.solana.com' });
const [product] = await sdk.createDppProducts([{ name: 'Watch 001', serial: 'W-001', brand: 'Acme' }]);
const results = await sdk.checkAuthenticityOnBlockchain([{ productId: product.id }]);
```

The `solana-dpp` SDK enables minting SPL tokens with embedded hashed metadata via memo instructions and provides a complete API for managing digital product passports on the Solana blockchain.

> **Open source (MIT).** Ce SDK est né chez [Safeout](https://www.linkedin.com/in/naggara-samir/), la solution d'authentification anti-contrefaçon dont j'étais le CTO, et a été soutenu par un grant de la Solana Foundation. Il est aujourd'hui entièrement open source et libre d'usage.

## Quick example

```ts
import { SolanaDppSdk } from 'solana-dpp';

const sdk = new SolanaDppSdk();
await sdk.init({ rpcUrl: process.env.SOLANA_RPC_URL, databaseUrl: process.env.DATABASE_URL });

// Mint a Digital Product Passport for one product
const [product] = await sdk.createDppProducts([
  { name: 'Watch #001', metadata: { brand: 'Acme', serial: 'A-001' } },
]);

// Later, verify authenticity from the on-chain hash
const [check] = await sdk.checkAuthenticityOnBlockchain([{ productId: product.id }]);
console.log(check.authentic); // true
```


## Features

- 🚀 **Ultra-simple API** - Empty constructor, all config in `init()`
- 🔗 **Blockchain Integration** - Solana SPL tokens with memo instructions
- 📊 **PostgreSQL Storage** - Automatic schema creation and migration management
- 🔒 **Access Control** - Three-tier visibility (public, owner, private)
- ⚡ **Auto-setup** - Database and blockchain initialization with automatic migrations
- 🛡️ **Type Safety** - Full TypeScript support with Zod validation
- 📦 **Batch-First API** - All operations use batch functions for consistency and performance
- 🔄 **Consistent Hash Verification** - Fixed hash calculation consistency between creation and verification
- 🔍 **Detailed Diagnostics** - Precise field-level difference detection when data is modified

## API Design Philosophy

**All SDK functions use batch-only operations.** This design provides:

- ✅ **Consistency** - Single API pattern for all operations
- ✅ **Performance** - Parallel processing of multiple items
- ✅ **Simplicity** - No dual single/batch function maintenance
- ✅ **Scalability** - Built for handling multiple operations efficiently

**For single operations:** Use arrays with one element.
```typescript
// Single product creation
const products = await sdk.createDppProducts([productData]);
const product = products[0];

// Single product verification
const results = await sdk.checkAuthenticityOnBlockchain([{ productId: "abc-123" }]);
const result = results.get("abc-123");
```

## Quick Start

### Installation

```bash
npm install solana-dpp
```

### Basic Usage

```typescript
import { SolanaDppSdk } from 'solana-dpp';

const sdk = new SolanaDppSdk();

await sdk.init({
  databaseUrl: "postgresql://user:pass@localhost:5432/database",
  // All other options are optional with sensible defaults
});

// Create a digital product passport (using batch API)
const products = await sdk.createDppProducts([{
  productUid: "unique-product-id",
  info: {
    // ... product data with DPP fields
  }
}]);

const product = products[0]; // Get the first (and only) product
```

### Configuration Options

```typescript
interface SolanaDppConfig {
  databaseUrl: string;                    // Required: PostgreSQL connection
  rpcUrl?: string;                       // Optional: Solana RPC (default: devnet)
  mintAuthorityPrivateKey?: string;      // Optional: Private key as JSON array
  ownerPrivateKey?: string;              // Optional: Owner private key
}
```

## API Reference

### Initialization

#### `constructor()`
Creates a new SolanaDppSdk instance with empty constructor.

#### `init(config: SolanaDppConfig): Promise<void>`
Initializes the SDK with configuration. Must be called before using other methods.

### Product Management

**All functions use batch-only API - use arrays with single elements for individual operations.**

#### `createDppProducts(productsData: ProductInput[], changedBy?: string): Promise<CompleteProduct[]>`
Creates digital product passports with blockchain tokens.

**Example:**
```typescript
// Single product
const products = await sdk.createDppProducts([{
  productUid: "abc-123",
  info: {
    productName: { value: "EcoLaptop", accessibilityLevel: "public" },
    manufacturer: {
      name: { value: "GreenTech", accessibilityLevel: "public" },
      // ...
    }
    // ...
  }
}], "john-doe");

const product = products[0]; // Get the created product

// Multiple products
const multipleProducts = await sdk.createDppProducts([
  { productUid: "abc-123", info: { /* ... */ } },
  { productUid: "def-456", info: { /* ... */ } },
  { productUid: "ghi-789", info: { /* ... */ } }
], "john-doe");
```

#### `updateDppProducts(updates: Array<{ productId: string; updateData: Partial<ProductInput> }>, changedBy?: string): Promise<CompleteProduct[]>`
Updates existing products and their blockchain tokens.

**Example:**
```typescript
// Single product update
const updatedProducts = await sdk.updateDppProducts([{
  productId: "abc-123",
  updateData: {
    info: {
      productName: { value: "Updated EcoLaptop", accessibilityLevel: "public" }
    }
  }
}], "john-doe");

// Multiple products update
const multipleUpdates = await sdk.updateDppProducts([
  { productId: "abc-123", updateData: { /* ... */ } },
  { productId: "def-456", updateData: { /* ... */ } }
], "john-doe");
```

#### `deleteDppProducts(productIds: string[], changedBy?: string): Promise<void>`
Deletes products from database and blockchain.

**Example:**
```typescript
// Single product deletion
await sdk.deleteDppProducts(["abc-123"], "john-doe");

// Multiple products deletion
await sdk.deleteDppProducts(["abc-123", "def-456", "ghi-789"], "john-doe");
```

#### `getDppProducts(productIds: string[], userAccessLevel?: 'public'|'owner'|'private'): Promise<CompleteProduct[]>`
Retrieves products with access-level filtering.

**Example:**
```typescript
// Single product retrieval
const products = await sdk.getDppProducts(["abc-123"], "public");
const product = products[0];

// Multiple products retrieval
const multipleProducts = await sdk.getDppProducts(["abc-123", "def-456"], "owner");
```

### Validation

#### `validateDppProductData(productData: ProductInput): ProductInput`
Validates DPP product data structure using Zod schemas.

#### `normalizeUserName(userName?: string): string`
Normalizes user names for consistency (lowercase, trimmed, defaults to 'system' if empty).

**Example:**
```typescript
const normalizedUser = sdk.normalizeUserName("  John DOE  ");
console.log(normalizedUser); // "john doe"

const defaultUser = sdk.normalizeUserName("");
console.log(defaultUser); // "system"
```

### Blockchain Operations

#### `calculateProductHash(productData: ProductInput): { publicHash: string; ownerHash: string; brandHash: string; }`
Calculates product hashes for verification purposes using **exactly the same algorithm** as blockchain verification. This function provides perfect hash synchronization between client-side verification and blockchain storage.

**Key Features:**
- ✅ **Perfect Synchronization**: Produces identical hashes to blockchain operations
- ✅ **DPPField Based**: Uses `accessibilityLevel` from DPPField structures exclusively
- ✅ **Client-side Verification**: No database access required
- ✅ **Same SHA256 Algorithm**: Identical to blockchain hash calculation

**Hash Levels:**
- `publicHash`: Only fields with `accessibilityLevel: 'public'`
- `ownerHash`: Fields with `accessibilityLevel: 'public'` OR `'owner'`
- `brandHash`: All fields (`'public'`, `'owner'`, and `'private'`)

**Example:**
```typescript
const hashes = sdk.calculateProductHash({
  productUid: "abc-123",
  info: {
    productName: { value: "EcoLaptop", accessibilityLevel: "public" },
    manufacturer: {
      name: { value: "GreenTech", accessibilityLevel: "public" },
      contactEmail: { value: "contact@greentech.com", accessibilityLevel: "owner" }
    },
    hazardousSubstances: [{
      substance: { value: "Lead", accessibilityLevel: "private" },
      concentration: { value: "0.08%", accessibilityLevel: "private" }
    }]
    // ... other DPP fields
  }
});

console.log(hashes.publicHash);  // Hash of: productName, manufacturer.name
console.log(hashes.ownerHash);   // Hash of: above + manufacturer.contactEmail
console.log(hashes.brandHash);   // Hash of: above + hazardousSubstances

// ✅ These hashes will EXACTLY match what's stored on blockchain!
```

**Verification Workflow:**
```typescript
// 1. Calculate expected hash client-side
const expectedHashes = sdk.calculateProductHash(productData);

// 2. Check against blockchain (using batch API)
const results = await sdk.checkAuthenticityOnBlockchain([{ productId: "abc-123" }]);
const result = results.get("abc-123");

// 3. Perfect match verification
if (result?.hashes?.publicHash === expectedHashes.publicHash) {
  console.log("✅ Hash verification successful - data is authentic!");
}
```

#### `checkAuthenticityOnBlockchain(products: Array<{ productId: string; productData?: any }>): Promise<Map<string, AuthenticityResult>>`
Verifies product authenticity against blockchain records with complete cryptographic proof.

**Two modes of operation:**
- **Simple mode** (no productData): Only checks if product exists on blockchain
- **Complete mode** (with productData): Verifies hashes match between provided data and blockchain records

**Returns a Map of productId to AuthenticityResult:**
```typescript
{
  isOnBlockchain: boolean;         // Product exists on blockchain (signature found)
  isValid: boolean;                // Hash match (if on blockchain)
  reason?: string;
  signature?: string;              // Blockchain transaction signature
  hashes?: {
    publicHash: string;            // Public metadata hash
    ownerHash: string;             // Owner metadata hash
    brandHash: string;             // Brand metadata hash
  };
  blockchainData?: {
    memo: any;                     // Raw memo data from blockchain
    transaction?: string;          // Transaction ID
    slot?: number;                 // Block slot number
  };
  fieldDifferences?: Array<{       // Detailed differences when data is modified
    path: string;                  // Field path (e.g., "productName.value", "manufacturer.name.value")
    storedValue: any;              // Value stored in database
    providedValue: any;            // Value provided for verification
    changeType: 'modified' | 'added' | 'removed';
  }>;
}
```

**Result Scenarios:**
- **Not on blockchain**: `{ isOnBlockchain: false, isValid: false, reason: "Product not found on blockchain" }`
- **On blockchain, invalid**: `{ isOnBlockchain: true, isValid: false, reason: "Hash mismatch", fieldDifferences: [...] }`
- **On blockchain, valid**: `{ isOnBlockchain: true, isValid: true, reason: "All hashes verified successfully" }`

**Examples:**
```typescript
// Single product verification (simple mode)
const results = await sdk.checkAuthenticityOnBlockchain([
  { productId: "abc-123" }
]);
const result = results.get("abc-123");
console.log(`Product ${result?.isValid ? 'VALID' : 'INVALID'}`);

// Single product verification (complete mode with data verification)
const results = await sdk.checkAuthenticityOnBlockchain([
  { productId: "abc-123", productData: originalProductData }
]);

// Multiple products verification
const results = await sdk.checkAuthenticityOnBlockchain([
  { productId: "abc-123" },
  { productId: "def-456", productData: someProductData },
  { productId: "ghi-789" }
]);

results.forEach((result, productId) => {
  console.log(`${productId}: ${result.isValid ? 'VALID' : 'INVALID'}`);
  if (result.signature) {
    console.log(`Blockchain proof: ${result.signature}`);
  }
  if (result.hashes) {
    console.log(`Hash verification completed`);
  }
  if (result.fieldDifferences && result.fieldDifferences.length > 0) {
    console.log(`Found ${result.fieldDifferences.length} field differences:`);
    result.fieldDifferences.forEach(diff => {
      console.log(`  - ${diff.path}: "${diff.storedValue}" → "${diff.providedValue}" (${diff.changeType})`);
    });
  }
});
```

#### `checkAndTopUpBalance(minBalance?: number): Promise<boolean>`
Checks and tops up SOL balance if needed (devnet/testnet only).

#### `getBalance(): Promise<number>`
Gets current SOL balance in SOL units.

#### `getMintInfo(): { mintAddress: string | null; mintAuthority: string }`
Returns mint address and authority information.

### History & Analytics

#### `getProductHistory(productId: string): Promise<any[]>`
Gets complete history for a specific product.

#### `getAllProductHistory(limit?: number, offset?: number): Promise<any[]>`
Gets history for all products with pagination.

#### `getProductHistoryByAction(action: string, limit?: number, offset?: number): Promise<any[]>`
Filters history by action type (CREATE, UPDATE, DELETE).

#### `getProductHistoryByUser(userId: string, limit?: number, offset?: number): Promise<any[]>`
Gets history for a specific user.

#### `getProductHistoryByDateRange(startDate: Date, endDate: Date, limit?: number, offset?: number): Promise<any[]>`
Gets history within a date range.

#### `getProductHistoryStats(): Promise<{ totalProducts: number; totalActions: number; actionBreakdown: any; topUsers: any }>`
Returns comprehensive history statistics.

### Visibility Management

#### `updateProductVisibility(productId: string, visibilityData: any): Promise<void>`
Updates product visibility settings for different access levels.

#### `getProductVisibilityHashes(productId: string): Promise<any>`
Gets visibility-based hashes for public, owner, and brand levels.

### Utilities

#### `normalizeUserName(userName?: string): string`
Normalizes user names for consistent storage.

## DPP Field Structure

All product information uses the `DPPField` structure for access control:

```typescript
type DPPField = {
  value: any;
  accessibilityLevel: 'public' | 'owner' | 'private';
};
```

**Example:**
```typescript
{
  productName: { value: "EcoLaptop X200", accessibilityLevel: "public" },
  manufacturer: {
    name: { value: "GreenTech Ltd.", accessibilityLevel: "public" },
    contactEmail: { value: "contact@greentech.com", accessibilityLevel: "owner" }
  },
  hazardousSubstances: [
    {
      substance: { value: "Lead", accessibilityLevel: "private" },
      concentration: { value: "0.08", accessibilityLevel: "private" }
    }
  ]
}
```

## Environment Setup

Create a `.env` file:

```env
# Required
DATABASE_URL="postgresql://user:password@localhost:5432/database"

# Optional - Solana Configuration
SOLANA_RPC_URL="https://api.devnet.solana.com"
MINT_AUTHORITY_PRIVATE_KEY="[<64 comma-separated bytes of the keypair secret key>]"
OWNER_PRIVATE_KEY="[<64 comma-separated bytes of the keypair secret key>]"
```

## Database

The SDK automatically creates the required PostgreSQL schema on first run. No manual migrations needed!

**Required tables:**
- `dpp_products` - Main product data
- `manufacturers` - Manufacturer information
- `material_compositions` - Product materials
- `hazardous_substances` - Hazardous materials
- `dpp_product_history` - Change tracking
- `dpp_product_visibility` - Access control

## Development

### Commands

```bash
npm run build          # Compile TypeScript
npm start             # Run CLI demo
npm test              # Run tests
npm run db:migrate    # Manual migration (usually not needed)
```

### CLI Demo

The project includes a comprehensive CLI for testing:

```bash
npm start
```

Available actions:
- `create` - Create demo product
- `update` - Update existing product
- `delete` - Delete product
- `get` - Retrieve product
- `check` - Verify blockchain authenticity
- `history` - View change history
- `visibility` - Manage access levels
- `exit` - Exit CLI

## Architecture

- **SolanaDppSdk** - Main API class
- **DatabaseManager** - PostgreSQL operations
- **TokenManager** - Solana blockchain operations
- **MintManager** - Token minting operations
- **HistoryManager** - Change tracking
- **ValidationUtils** - Data validation

## Testing

Two levels of tests:

- **Unit tests** (`npm run test:unit`): hash calculation and edge cases. No database, no network. This is what CI runs on every push.
- **Integration tests** (`npm run test:integration`, or `npm test`): full workflow against PostgreSQL and Solana devnet. They need `DATABASE_URL`, and a funded devnet wallet in `MINT_AUTHORITY_PRIVATE_KEY` and `OWNER_PRIVATE_KEY` (see `.env.example`). In CI they run only when those two repository secrets are set.

```bash
npm run test:unit          # fast, offline
npm run test:integration   # PostgreSQL + devnet, needs a funded wallet
npm run test:watch
```

## Database Migrations

The SDK includes an automatic migration system that ensures your database schema is always up to date.

### Automatic Migrations

Migrations run automatically when you initialize the SDK:

```typescript
const sdk = new SolanaDppSdk();
await sdk.init({
  databaseUrl: "postgresql://user:password@localhost:5432/database",
  rpcUrl: "https://api.devnet.solana.com"
});
// Migrations run automatically during init()
```

### Manual Migration Commands

For users who installed the package from NPM, use the global CLI command:

```bash
# Install globally for CLI access (optional)
npm install -g solana-dpp

# Run migrations using the global CLI
solana-dpp-migrate

# Or run directly with npx (no global install needed)
npx solana-dpp-migrate
```

For development within this repository:

```bash
# Run all pending migrations
npm run db:migrate

# Or use the setup command (alias for migrate)
npm run db:setup
```

### Manual Migration via API

```typescript
const sdk = new SolanaDppSdk();
await sdk.init({...});

// Run migrations manually
await sdk.runDatabaseMigrations();
```

### Migration System Features

- ✅ **Automatic detection** - Runs only pending migrations
- ✅ **Safe execution** - Each migration runs in a transaction (auto-rollback on error)
- ✅ **Legacy compatibility** - Automatically migrates from old migration tracking
- ✅ **Idempotent** - Safe to run multiple times
- ✅ **Ordered execution** - Migrations run in chronological order (001, 002, 003...)

### Migration History

The system tracks applied migrations in the `schema_migrations` table:

```sql
-- View applied migrations
SELECT version, applied_at FROM schema_migrations ORDER BY version;
```

### Current Migrations

- `001_initial_schema.sql` - Initial database schema
- `002_add_accessibility_levels.sql` - AccessibilityLevel columns for proper hash calculation

New migrations are automatically detected and applied when you update the SDK version.

## License

MIT

## License

MIT. See [LICENSE](LICENSE).

## Authors

- **Samir Naggara** : [@SamirNaggara](https://github.com/SamirNaggara)
- **Axel Giguaire** : [@MrFeuylle](https://github.com/MrFeuylle)

## License

MIT. See [LICENSE](./LICENSE).
