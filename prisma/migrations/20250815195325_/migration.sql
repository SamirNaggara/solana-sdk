-- CreateTable
CREATE TABLE "dpp_products" (
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "dateOfManufacture" TIMESTAMP(3) NOT NULL,
    "placeOfManufacture" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "repairabilityScore" DOUBLE PRECISION,
    "endOfLifeInstructions" TEXT NOT NULL,
    "digitalLink" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,

    CONSTRAINT "dpp_products_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_compositions" (
    "id" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "material_compositions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hazardous_substances" (
    "id" TEXT NOT NULL,
    "substance" TEXT NOT NULL,
    "casNumber" TEXT NOT NULL,
    "concentration" DOUBLE PRECISION NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "hazardous_substances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dpp_product_history" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousData" JSONB,
    "newData" JSONB,
    "changeDescription" TEXT,

    CONSTRAINT "dpp_product_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dpp_product_visibility" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "public" JSONB,
    "owner" JSONB,
    "brand" JSONB,

    CONSTRAINT "dpp_product_visibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dpp_product_history_productId_idx" ON "dpp_product_history"("productId");

-- CreateIndex
CREATE INDEX "dpp_product_history_changeTimestamp_idx" ON "dpp_product_history"("changeTimestamp");

-- CreateIndex
CREATE INDEX "dpp_product_visibility_productId_idx" ON "dpp_product_visibility"("productId");

-- AddForeignKey
ALTER TABLE "dpp_products" ADD CONSTRAINT "dpp_products_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_compositions" ADD CONSTRAINT "material_compositions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "dpp_products"("productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hazardous_substances" ADD CONSTRAINT "hazardous_substances_productId_fkey" FOREIGN KEY ("productId") REFERENCES "dpp_products"("productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dpp_product_history" ADD CONSTRAINT "dpp_product_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "dpp_products"("productId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dpp_product_visibility" ADD CONSTRAINT "dpp_product_visibility_productId_fkey" FOREIGN KEY ("productId") REFERENCES "dpp_products"("productId") ON DELETE CASCADE ON UPDATE CASCADE;
