import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeAllSignatures() {
  try {
    const result = await prisma.productDPP.updateMany({
      data: { signature: null },
    });

    console.log(`Signatures supprimées pour ${result.count} produits.`);
  } catch (error) {
    console.error('Erreur lors de la suppression des signatures :', error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }
}

removeAllSignatures();
