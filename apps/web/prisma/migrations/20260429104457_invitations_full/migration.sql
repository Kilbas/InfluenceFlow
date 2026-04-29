/*
  Warnings:

  - A unique constraint covering the columns `[token]` on the table `invitations` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `invitations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `role` to the `invitations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `token` to the `invitations` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "invitations" ADD COLUMN     "accepted_at" TIMESTAMP(3),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "role" "Role" NOT NULL,
ADD COLUMN     "token" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");
