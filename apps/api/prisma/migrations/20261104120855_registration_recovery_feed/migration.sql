-- CreateTable
CREATE TABLE "recovery_credentials" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "verifier" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "usedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "recovery_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "text" VARCHAR(500) NOT NULL,
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recovery_credentials_userId_idx" ON "recovery_credentials"("userId");

-- CreateIndex
CREATE INDEX "posts_communityId_createdAt_idx" ON "posts"("communityId", "createdAt");

-- AddForeignKey
ALTER TABLE "recovery_credentials" ADD CONSTRAINT "recovery_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
