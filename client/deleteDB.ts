import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearDatabase() {
  try {
    await prisma.dppProductHistory.deleteMany();     
    await prisma.hazardousSubstance.deleteMany();    
    await prisma.materialComposition.deleteMany();   

    await prisma.productDPP.deleteMany();            
    await prisma.manufacturer.deleteMany();          

    console.log(' Toutes les données Prisma ont été supprimées avec succès.');
  } catch (error) {
    console.error(' Une erreur est survenue :', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();
