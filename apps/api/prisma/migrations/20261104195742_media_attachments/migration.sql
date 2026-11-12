-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "postId" UUID,
    "kind" VARCHAR(8) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_ownerId_createdAt_idx" ON "media"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "media_postId_idx" ON "media"("postId");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
