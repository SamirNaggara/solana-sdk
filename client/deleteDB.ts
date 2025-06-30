import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearDatabase() {
  try {
    // Supprimer les dépendances d'abord (relations enfants → parents)
    await prisma.dppProductHistory.deleteMany();     // dépend de productDPP
    await prisma.hazardousSubstance.deleteMany();    // dépend de productDPP
    await prisma.materialComposition.deleteMany();   // dépend de productDPP

    await prisma.productDPP.deleteMany();            // dépend de Manufacturer
    await prisma.manufacturer.deleteMany();          // peut être supprimé ensuite

    console.log('✅ Toutes les données Prisma ont été supprimées avec succès.');
  } catch (error) {
    console.error('❌ Une erreur est survenue :', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();
