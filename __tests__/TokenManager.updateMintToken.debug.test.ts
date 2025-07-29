import { TokenManager } from '../client/src/token-manager';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PrismaClient } from '@prisma/client';

describe('TokenManager updateMintToken debug', () => {
  let tokenManager: TokenManager;
  let prisma: PrismaClient;
  let connection: Connection;
  let mint: PublicKey;
  let owner: PublicKey;

  beforeAll(async () => {
    prisma = new PrismaClient();
    connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    mint = new PublicKey('So11111111111111111111111111111111111111112'); // SOL mint
    owner = Keypair.generate().publicKey;
    tokenManager = new TokenManager(connection, mint, owner, 'sha256', prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('should debug updateMintToken signature update', async () => {
    // First, let's create a test product with a signature
    const testProductId = 'test-product-' + Date.now();
    const testManufacturerId = 'test-manufacturer-' + Date.now();
    
    // Create a test manufacturer first
    const testManufacturer = await prisma.manufacturer.create({
      data: {
        id: testManufacturerId,
        name: 'Test Manufacturer',
        address: 'Test Address',
        contactEmail: 'test@example.com'
      }
    });

    // Create a test product in the database
    const testProduct = await prisma.productDPP.create({
      data: {
        id: testProductId,
        productName: 'Test Product',
        dateOfManufacture: new Date(),
        placeOfManufacture: 'Test Location',
        productCategory: 'Test Category',
        repairabilityScore: 5,
        endOfLifeInstructions: 'Test instructions',
        digitalLink: 'https://test.com',
        manufacturerId: testManufacturerId,
        signature: 'old-signature-12345' // Initial signature
      }
    });

    // Create visibility data for the product
    await prisma.dppProductVisibility.create({
      data: {
        productId: testProductId,
        public: ['id', 'productName'],
        owner: ['id', 'productName', 'manufacturer'],
        brand: ['id', 'productName', 'manufacturer', 'dateOfManufacture']
      }
    });

    console.log('Created test product with signature:', testProduct.signature);

    // Get the signature before update
    const signatureBefore = await (tokenManager as any).getSignatureFromId(testProductId);
    console.log('Signature before update:', signatureBefore);

    try {
      // Try to update the mint token
      const result = await tokenManager.updateMintToken(testProductId);
      console.log('Update result:', result);

      // Get the signature after update
      const signatureAfter = await (tokenManager as any).getSignatureFromId(testProductId);
      console.log('Signature after update:', signatureAfter);

      // Check if signature was actually updated
      expect(signatureAfter).not.toBe(signatureBefore);
      expect(signatureAfter).toBe(result.signature);

    } catch (error) {
      console.error('Error during updateMintToken:', error);
      
      // Let's check what went wrong
      const signatureAfterError = await (tokenManager as any).getSignatureFromId(testProductId);
      console.log('Signature after error:', signatureAfterError);
      
      throw error;
    } finally {
      // Cleanup
      await prisma.productDPP.delete({
        where: { id: testProductId }
      });
      await prisma.manufacturer.delete({
        where: { id: testManufacturerId }
      });
    }
  });
});
