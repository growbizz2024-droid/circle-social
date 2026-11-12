-- CreateTable
CREATE TABLE "user_avatars" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "seed" VARCHAR(100) NOT NULL,
    "defaultSeed" VARCHAR(100) NOT NULL,
    "config" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_avatars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_avatars_userId_key" ON "user_avatars"("userId");

-- AddForeignKey
ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
