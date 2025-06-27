import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const deleted = await prisma.productDPP.deleteMany();
  console.log(`🗑️ Supprimé ${deleted.count} produits`);
}

main()
  .catch((e) => {
    console.error("💥 Erreur :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
