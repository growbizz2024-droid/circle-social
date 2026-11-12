-- AlterTable
ALTER TABLE "users" ADD COLUMN     "activeThemeMediaId" UUID,
ADD COLUMN     "activeThemeSnapshot" JSONB;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_activeThemeMediaId_fkey" FOREIGN KEY ("activeThemeMediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
