-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "locationCity" VARCHAR(120),
ADD COLUMN     "locationCountry" VARCHAR(80),
ADD COLUMN     "locationCountryCode" CHAR(2);
