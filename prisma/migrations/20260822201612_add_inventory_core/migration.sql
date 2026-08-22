-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'ASSIGN', 'RETURN');

-- CreateTable
CREATE TABLE "inventory_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_item" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "teamId" TEXT NOT NULL,
    "categoryId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER,
    "isReturnable" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transaction" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "InventoryTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "resultingQuantity" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "memberId" TEXT,
    "assignmentId" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_assignment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "inventory_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_category_name_key" ON "inventory_category"("name");

-- CreateIndex
CREATE INDEX "inventory_category_isActive_idx" ON "inventory_category"("isActive");

-- CreateIndex
CREATE INDEX "inventory_item_teamId_isActive_idx" ON "inventory_item"("teamId", "isActive");

-- CreateIndex
CREATE INDEX "inventory_item_categoryId_idx" ON "inventory_item"("categoryId");

-- CreateIndex
CREATE INDEX "inventory_item_name_idx" ON "inventory_item"("name");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_item_teamId_sku_key" ON "inventory_item"("teamId", "sku");

-- CreateIndex
CREATE INDEX "inventory_transaction_itemId_createdAt_idx" ON "inventory_transaction"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_transaction_actorId_createdAt_idx" ON "inventory_transaction"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_transaction_memberId_createdAt_idx" ON "inventory_transaction"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_transaction_type_createdAt_idx" ON "inventory_transaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_transaction_assignmentId_idx" ON "inventory_transaction"("assignmentId");

-- CreateIndex
CREATE INDEX "inventory_assignment_itemId_returnedAt_idx" ON "inventory_assignment"("itemId", "returnedAt");

-- CreateIndex
CREATE INDEX "inventory_assignment_memberId_returnedAt_idx" ON "inventory_assignment"("memberId", "returnedAt");

-- CreateIndex
CREATE INDEX "inventory_assignment_assignedById_idx" ON "inventory_assignment"("assignedById");

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "inventory_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "inventory_assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assignment" ADD CONSTRAINT "inventory_assignment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assignment" ADD CONSTRAINT "inventory_assignment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assignment" ADD CONSTRAINT "inventory_assignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
