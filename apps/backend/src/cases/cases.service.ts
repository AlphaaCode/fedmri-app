import {
  Injectable,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InferenceService } from '../inference/inference.service';
import { FlService } from '../fl/fl.service';
import { randomUUID } from 'crypto';
import { CaseScope, CaseStatus, FeedbackType } from '@prisma/client';

@Injectable()
export class CasesService {
  constructor(
    private prisma: PrismaService,
    private inferenceService: InferenceService,
    private flService: FlService,
  ) {}

  async create(user: any, file: Express.Multer.File): Promise<any> {
    if (!file) {
      throw new InternalServerErrorException('No file provided');
    }

    const caseId = randomUUID();
    let scope: CaseScope;
    let hospitalId: string | null = null;
    let userId: string | null = null;

    // Determine scope
    if (user.role === 'DOCTOR') {
      scope = CaseScope.HOSPITAL;
      hospitalId = user.hospitalId;
    } else {
      scope = CaseScope.PATIENT;
      userId = user.id;
    }

    // Use the file path that multer provides
    const finalPath = file.path;

    // Predict (sync - awaited)
    let predictionResult;
    try {
      predictionResult = await this.inferenceService.predict(finalPath);
    } catch (error: any) {
      throw new InternalServerErrorException(
        `Inference failed: ${error?.message || 'Unknown error'}`,
      );
    }

    // Save case to DB
    const caseData: any = {
      id: caseId,
      scope,
      status: CaseStatus.PENDING,
      imagePath: finalPath,
      predictedSubtype: predictionResult.predicted_subtype,
      confidence: predictionResult.confidence,
      probs: predictionResult.probs,
      modelVersion: predictionResult.model_version,
      storedLocally: true,
      userId: user.id,
    };

    if (hospitalId) {
      caseData.hospitalId = hospitalId;
    }

    const savedCase = await this.prisma.case.create({
      data: caseData,
    });

    // Return case to client immediately
    const returnCase = {
      ...savedCase,
      probs: savedCase.probs, // Ensure probs is returned as array
    };

    // Fire-and-forget: trigger FL round if DOCTOR
    if (user.role === 'DOCTOR' && hospitalId) {
      this.flService.triggerRound(hospitalId, caseId);
    }

    return returnCase;
  }

  async findAll(
    user: any,
    query: { page?: number; limit?: number } = {},
  ): Promise<{ data: any[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    let where: any = {};

    // Filter by hospital (DOCTOR) or user (PATIENT)
    if (user.role === 'DOCTOR') {
      where.hospitalId = user.hospitalId;
    } else {
      where.userId = user.id;
    }

    const [data, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.case.count({ where }),
    ]);

    return {
      data: data.map((c) => ({
        ...c,
        probs: c.probs, // Ensure probs is returned as array
      })),
      total,
    };
  }

  async getAttention(user: any, id: string): Promise<{ attention: number[]; size: number }> {
    // Reuse findOne for silo enforcement (throws ForbiddenException on mismatch)
    await this.findOne(user, id);
    return this.inferenceService.getAttention(id);
  }

  async findOne(user: any, id: string): Promise<any> {
    const caseData = await this.prisma.case.findUnique({
      where: { id },
    });

    if (!caseData) {
      throw new ForbiddenException('Case not found');
    }

    // Enforce hospital silo
    if (user.role === 'DOCTOR' && caseData.hospitalId !== user.hospitalId) {
      throw new ForbiddenException(
        'You do not have access to this case',
      );
    }

    // Enforce patient silo
    if (user.role === 'PATIENT' && caseData.userId !== user.id) {
      throw new ForbiddenException(
        'You do not have access to this case',
      );
    }

    return {
      ...caseData,
      probs: caseData.probs,
    };
  }

  async submitFeedback(
    user: any,
    id: string,
    body: { type: 'VALIDATE' | 'DISPUTE'; correctSubtype?: string; justification?: string },
  ): Promise<any> {
    // Silo check — reuse findOne
    await this.findOne(user, id);

    const feedback = await this.prisma.feedback.create({
      data: {
        id: randomUUID(),
        caseId: id,
        doctorId: user.id,
        feedbackType: body.type === 'DISPUTE' ? FeedbackType.DISPUTE : FeedbackType.VALIDATE,
        correctedSubtype: body.correctSubtype ?? null,
        evidenceTypes: [],
        justification: body.justification ?? null,
      },
    });

    // On DISPUTE: update case status
    if (body.type === 'DISPUTE') {
      await this.prisma.case.update({
        where: { id },
        data: { status: CaseStatus.DISPUTED },
      });
    } else {
      await this.prisma.case.update({
        where: { id },
        data: { status: CaseStatus.VALIDATED },
      });
    }

    return feedback;
  }
}
