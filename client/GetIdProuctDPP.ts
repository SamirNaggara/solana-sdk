const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  try {
    const products = await prisma.productDPP.findMany({
      select: { id: true },
    })

    const ids = products.map((product: { id: any }) => product.id)

    console.log(JSON.stringify(ids))
  } catch (error) {
    console.error('Erreur lors de la récupération des IDs:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()