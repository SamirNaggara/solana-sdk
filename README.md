# solana-dpp

**TypeScript SDK for creating and managing Digital Product Passports (DPP) on Solana blockchain with secure metadata storage.**

The `solana-dpp` SDK enables minting SPL tokens with embedded hashed metadata via memo instructions and provides a complete API for managing digital product passports on the Solana blockchain.

## Features

- 🚀 **Ultra-simple API** - Empty constructor, all config in `init()`
- 🔗 **Blockchain Integration** - Solana SPL tokens with memo instructions
- 📊 **PostgreSQL Storage** - Automatic schema creation and management
- 🔒 **Access Control** - Three-tier visibility (public, owner, private)
- ⚡ **Auto-setup** - Database and blockchain initialization
- 🛡️ **Type Safety** - Full TypeScript support with Zod validation

## Quick Start

### Installation

```bash
npm install solana-dpp
```

### Basic Usage

```typescript
import { SafeoutSDK } from 'solana-dpp';

const sdk = new SafeoutSDK();

await sdk.init({
  databaseUrl: "postgresql://user:pass@localhost:5432/database",
  // All other options are optional with sensible defaults
});

// Create a digital product passport
const product = await sdk.createDppProducts({
  productUid: "unique-product-id",
  info: {
    // ... product data with DPP fields
  }
});
```

### Configuration Options

```typescript
interface SafeoutConfig {
  databaseUrl: string;                    // Required: PostgreSQL connection
  rpcUrl?: string;                       // Optional: Solana RPC (default: devnet)
  mintAuthorityPrivateKey?: string;      // Optional: Private key as JSON array
  ownerPrivateKey?: string;              // Optional: Owner private key
}
```

## API Reference

### Initialization

#### `constructor()`
Creates a new SafeoutSDK instance with empty constructor.

#### `init(config: SafeoutConfig): Promise<void>`
Initializes the SDK with configuration. Must be called before using other methods.

### Product Management

#### `createDppProducts(productData: ProductInput, changedBy?: string): Promise<CompleteProduct>`
#### `createDppProducts(productsData: ProductInput[], changedBy?: string): Promise<CompleteProduct[]>`
Creates one or multiple digital product passports with blockchain tokens.

**Example:**
```typescript
const product = await sdk.createDppProducts({
  productUid: "abc-123",
  info: {
    productName: { value: "EcoLaptop", accessibilityLevel: "public" },
    manufacturer: {
      name: { value: "GreenTech", accessibilityLevel: "public" },
      // ...
    }
    // ...
  }
}, "john-doe");
```

#### `updateDppProducts(productId: string, updateData: Partial<ProductInput>, changedBy?: string): Promise<CompleteProduct>`
#### `updateDppProducts(productIds: string[], updateData: Partial<ProductInput>, changedBy?: string): Promise<CompleteProduct[]>`
Updates existing products and their blockchain tokens.

#### `deleteDppProducts(productId: string, changedBy?: string): Promise<void>`
#### `deleteDppProducts(productIds: string[], changedBy?: string): Promise<void>`
Deletes products from database and blockchain.

#### `getDppProducts(productId: string, userAccessLevel?: 'public'|'owner'|'private'): Promise<CompleteProduct>`
#### `getDppProducts(productIds: string[], userAccessLevel?: 'public'|'owner'|'private'): Promise<CompleteProduct[]>`
Retrieves products with access-level filtering.

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

// 2. Check against blockchain
const result = await sdk.checkAuthenticityOnBlockchain("abc-123");

// 3. Perfect match verification
if (result.hashes?.publicHash === expectedHashes.publicHash) {
  console.log("✅ Hash verification successful - data is authentic!");
}
```

#### `checkAuthenticityOnBlockchain(productId: string): Promise<AuthenticityResult>`
Verifies product authenticity against blockchain records with complete cryptographic proof.

**Returns:**
```typescript
{
  isValid: boolean;
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
}
```

#### `checkBatchAuthenticityOnBlockchain(productIds: string[]): Promise<Map<string, AuthenticityResult>>`
Verifies authenticity of multiple products in parallel with complete proof data.

**Example:**
```typescript
const results = await sdk.checkBatchAuthenticityOnBlockchain(['id1', 'id2', 'id3']);
results.forEach((result, productId) => {
  console.log(`${productId}: ${result.isValid ? 'VALID' : 'INVALID'}`);
  if (result.signature) {
    console.log(`Blockchain proof: ${result.signature}`);
  }
  if (result.hashes) {
    console.log(`Hash verification completed`);
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
MINT_AUTHORITY_PRIVATE_KEY="[12,34,56,...]"
OWNER_PRIVATE_KEY="[12,34,56,...]"
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

- **SafeoutSDK** - Main API class
- **DatabaseManager** - PostgreSQL operations
- **TokenManager** - Solana blockchain operations
- **MintManager** - Token minting operations
- **HistoryManager** - Change tracking
- **ValidationUtils** - Data validation

## License

MIT