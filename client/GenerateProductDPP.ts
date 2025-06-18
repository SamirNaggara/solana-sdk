import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding 1000 ProductDPP records...')

  const products = []

  for (let i = 0; i < 10000; i++) {
    products.push({
      id: randomUUID(),
      info: {
        name: `Product ${i + 1}`,
        description: `This is the description for product ${i + 1}`,
        tags: ['tag1', 'tag2'],
      },
    })
  }

  await prisma.productDPP.createMany({
    data: products,
  })

  console.log('✅ Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
