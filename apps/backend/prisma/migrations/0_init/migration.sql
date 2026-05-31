-- CreateEnum
CREATE TYPE "CaseScope" AS ENUM ('HOSPITAL', 'PATIENT');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('PENDING', 'VALIDATED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "FLStrategy" AS ENUM ('FEDAVG', 'FEDPROX');

-- CreateEnum
CREATE TYPE "FLTrigger" AS ENUM ('DOCTOR_UPLOAD', 'DISPUTE', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('VALIDATE', 'DISPUTE');

-- CreateEnum
CREATE TYPE "PrivacyEvent" AS ENUM ('WEIGHTS_SENT', 'ROUND_COMPLETE', 'DISPUTE_SIGNAL');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DOCTOR', 'PATIENT', 'ADMIN');

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hospitalId" TEXT,
    "scope" "CaseScope" NOT NULL,
    "imagePath" TEXT NOT NULL,
    "storedLocally" BOOLEAN NOT NULL DEFAULT true,
    "predictedSubtype" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "probs" JSONB NOT NULL,
    "attentionMap" JSONB,
    "modelVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "CaseStatus" NOT NULL DEFAULT 'PENDING',
    "flRoundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "feedbackType" "FeedbackType" NOT NULL,
    "correctedSubtype" TEXT,
    "evidenceTypes" JSONB NOT NULL,
    "justification" TEXT,
    "alTriggered" BOOLEAN NOT NULL DEFAULT false,
    "newModelVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlContribution" (
    "id" TEXT NOT NULL,
    "flRoundId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "localEpochs" INTEGER NOT NULL,
    "samplesUsed" INTEGER NOT NULL,
    "localF1Before" DOUBLE PRECISION NOT NULL,
    "localF1After" DOUBLE PRECISION NOT NULL,
    "weightDeltaNorm" DOUBLE PRECISION NOT NULL,
    "privacyBudgetUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlRound" (
    "id" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "strategy" "FLStrategy" NOT NULL,
    "participants" JSONB NOT NULL,
    "globalF1Before" DOUBLE PRECISION NOT NULL,
    "globalF1After" DOUBLE PRECISION NOT NULL,
    "f1PerClassAfter" JSONB NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "modelVersion" INTEGER NOT NULL,
    "triggeredBy" "FLTrigger" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "flClientId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelMetrics" (
    "id" TEXT NOT NULL,
    "modelVersion" INTEGER NOT NULL,
    "flRound" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "f1Macro" DOUBLE PRECISION NOT NULL,
    "f1PerClass" JSONB NOT NULL,
    "strategy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacyAuditLog" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "flRoundId" TEXT,
    "eventType" "PrivacyEvent" NOT NULL,
    "bytesTransmitted" INTEGER NOT NULL,
    "rawDataTransmitted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "hospitalId" TEXT,
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "casesContributed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Case_hospitalId_idx" ON "Case"("hospitalId" ASC);

-- CreateIndex
CREATE INDEX "Case_scope_idx" ON "Case"("scope" ASC);

-- CreateIndex
CREATE INDEX "Case_userId_idx" ON "Case"("userId" ASC);

-- CreateIndex
CREATE INDEX "ChatMessage_userId_idx" ON "ChatMessage"("userId" ASC);

-- CreateIndex
CREATE INDEX "FlContribution_flRoundId_idx" ON "FlContribution"("flRoundId" ASC);

-- CreateIndex
CREATE INDEX "FlContribution_hospitalId_idx" ON "FlContribution"("hospitalId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_flClientId_key" ON "Hospital"("flClientId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ModelMetrics_modelVersion_key" ON "ModelMetrics"("modelVersion" ASC);

-- CreateIndex
CREATE INDEX "PrivacyAuditLog_hospitalId_idx" ON "PrivacyAuditLog"("hospitalId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email" ASC);

-- CreateIndex
CREATE INDEX "User_hospitalId_idx" ON "User"("hospitalId" ASC);

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_flRoundId_fkey" FOREIGN KEY ("flRoundId") REFERENCES "FlRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlContribution" ADD CONSTRAINT "FlContribution_flRoundId_fkey" FOREIGN KEY ("flRoundId") REFERENCES "FlRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlContribution" ADD CONSTRAINT "FlContribution_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyAuditLog" ADD CONSTRAINT "PrivacyAuditLog_flRoundId_fkey" FOREIGN KEY ("flRoundId") REFERENCES "FlRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyAuditLog" ADD CONSTRAINT "PrivacyAuditLog_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;
