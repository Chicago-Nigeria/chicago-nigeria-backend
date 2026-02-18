-- CreateTable
CREATE TABLE "SocialSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planName" TEXT NOT NULL DEFAULT 'Social Media Management',
    "amount" INTEGER NOT NULL DEFAULT 6500,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'active',
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripePriceId" TEXT,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "socialHandles" JSONB,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "description" TEXT,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialSubscription_userId_key" ON "SocialSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SocialSubscription_stripeSubscriptionId_key" ON "SocialSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "SocialSubscription_userId_idx" ON "SocialSubscription"("userId");

-- CreateIndex
CREATE INDEX "SocialSubscription_status_idx" ON "SocialSubscription"("status");

-- CreateIndex
CREATE INDEX "SocialSubscription_stripeSubscriptionId_idx" ON "SocialSubscription"("stripeSubscriptionId");

-- AddForeignKey
ALTER TABLE "SocialSubscription" ADD CONSTRAINT "SocialSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
