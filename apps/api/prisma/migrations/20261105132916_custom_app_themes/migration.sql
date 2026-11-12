-- AlterTable
ALTER TABLE "users" ADD COLUMN     "activeThemeId" UUID,
ADD COLUMN     "themeVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "custom_themes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(180) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "backgroundMediaId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "custom_themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_themes_userId_deletedAt_updatedAt_idx" ON "custom_themes"("userId", "deletedAt", "updatedAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_activeThemeId_fkey" FOREIGN KEY ("activeThemeId") REFERENCES "custom_themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_themes" ADD CONSTRAINT "custom_themes_backgroundMediaId_fkey" FOREIGN KEY ("backgroundMediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_themes" ADD CONSTRAINT "custom_themes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
