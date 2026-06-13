import {
  Injectable,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InferenceService } from '../inference/inference.service';
import { FlService } from '../fl/fl.service';
import { AlService } from './al.service';
import { randomUUID } from 'crypto';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { CaseScope, CaseStatus, FeedbackType } from '@prisma/client';

@Injectable()
export class CasesService {
  constructor(
    private prisma: PrismaService,
    private inferenceService: InferenceService,
    private flService: FlService,
    private alService: AlService,
  ) {}

  private samplesDir = process.env.SAMPLES_DIR || '';

  /** List bundled sample MRI volumes (for the "Use a sample scan" picker). */
  listSamples(): { name: string }[] {
    if (!this.samplesDir || !existsSync(this.samplesDir)) return [];
    return readdirSync(this.samplesDir)
      .filter((f) => f.endsWith('.mha') || f.endsWith('.nii') || f.endsWith('.nii.gz'))
      .slice(0, 12)
      .map((name) => ({ name }));
  }

  /** Create a case from a bundled sample volume (runs the same real pipeline). */
  async createFromSample(
    user: any,
    name: string,
    meta?: { subjectType?: string; subjectLabel?: string },
  ): Promise<any> {
    if (!/^[\w.-]+\.(mha|nii|nii\.gz)$/.test(name)) {
      throw new ForbiddenException('bad sample name');
    }
    const path = join(this.samplesDir, name);
    if (!existsSync(path)) throw new ForbiddenException('sample not found');
    // Reuse create() with a multer-shaped object pointing at the sample on disk.
    return this.create(user, { path, originalname: name } as any, meta);
  }

  async create(
    user: any,
    file: Express.Multer.File,
    meta?: { subjectType?: string; subjectLabel?: string },
  ): Promise<any> {
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

    // Subject attribution. Doctors tag who/what a scan is for (a patient study
    // vs a TEST run); patient self-uploads are always their own PATIENT study.
    let subjectType: string;
    let subjectLabel: string | null;
    if (user.role === 'DOCTOR') {
      subjectType = meta?.subjectType === 'TEST' ? 'TEST' : 'PATIENT';
      const label = (meta?.subjectLabel ?? '').toString().trim().slice(0, 120);
      subjectLabel = label || (subjectType === 'TEST' ? 'Test scan' : null);
    } else {
      subjectType = 'PATIENT';
      subjectLabel = null;
    }

    // Save case to DB
    const caseData: any = {
      id: caseId,
      scope,
      status: CaseStatus.PENDING,
      imagePath: finalPath,
      subjectType,
      subjectLabel,
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

    // Return case to client immediately. f1/auc/hormoneTherapy are additive
    // real-mode fields surfaced transiently (not persisted — no schema change).
    const returnCase = {
      ...savedCase,
      probs: savedCase.probs, // Ensure probs is returned as array
      f1: predictionResult.f1,
      auc: predictionResult.auc,
      hormoneTherapy: predictionResult.hormone_therapy,
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

  /**
   * Active-learning review queue: the cases the model is LEAST sure about
   * (confidence closest to 0.5), still PENDING, scoped to the caller's silo.
   * The doctor labels these first — uncertainty sampling — and each label feeds
   * the AL fine-tune. uncertainty = 1 − |conf − 0.5|·2 (1 = maximally unsure).
   */
  async getReviewQueue(user: any, limit = 6): Promise<any[]> {
    const where: any =
      user.role === 'DOCTOR'
        ? { hospitalId: user.hospitalId }
        : { userId: user.id };
    where.status = CaseStatus.PENDING;

    const rows = await this.prisma.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return rows
      .map((c) => ({
        ...c,
        probs: c.probs,
        uncertainty: Number((1 - Math.abs(c.confidence - 0.5) * 2).toFixed(4)),
      }))
      .sort((a, b) => b.uncertainty - a.uncertainty)
      .slice(0, limit);
  }

  async getAttention(
    user: any,
    id: string,
  ): Promise<{ attention: number[]; size: number; slicePng?: string; topSlice?: number }> {
    // Reuse findOne for silo enforcement (throws ForbiddenException on mismatch);
    // it returns the case with imagePath, which real-mode attention needs.
    const c = await this.findOne(user, id);
    return this.inferenceService.getAttention(id, c.imagePath);
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

  /**
   * Update editable, doctor-owned fields of a case: the clinical note and the
   * subject attribution (patient label / TEST). Silo-checked via findOne, and
   * only the owning role may edit (doctors edit hospital cases; patients can
   * annotate their own). Never touches prediction/privacy fields.
   */
  async updateCase(
    user: any,
    id: string,
    body: { clinicalNote?: string; subjectType?: string; subjectLabel?: string },
  ): Promise<any> {
    await this.findOne(user, id); // silo enforcement (throws on mismatch)

    const data: any = {};
    if (body.clinicalNote !== undefined) {
      data.clinicalNote = body.clinicalNote.toString().slice(0, 2000) || null;
    }
    // Subject attribution is a doctor concept; patients can't reclassify a study.
    if (user.role === 'DOCTOR') {
      if (body.subjectType !== undefined) {
        data.subjectType = body.subjectType === 'TEST' ? 'TEST' : 'PATIENT';
      }
      if (body.subjectLabel !== undefined) {
        data.subjectLabel = body.subjectLabel.toString().trim().slice(0, 120) || null;
      }
    }

    const updated = await this.prisma.case.update({ where: { id }, data });
    return { ...updated, probs: updated.probs };
  }

  async verifyImage(file: Express.Multer.File): Promise<{ valid: boolean; confidence: number; reason: string }> {
    return this.inferenceService.verifyImage(file.buffer, file.originalname || 'scan.jpg');
  }

  async submitFeedback(
    user: any,
    id: string,
    body: { type: 'VALIDATE' | 'DISPUTE'; correctSubtype?: string; justification?: string },
  ): Promise<any> {
    // Silo check — reuse findOne (throws ForbiddenException on cross-hospital access)
    const caseRow = await this.findOne(user, id);

    const isDispute = body.type === 'DISPUTE';

    if (isDispute && !body.correctSubtype) {
      throw new ForbiddenException('correctSubtype is required for DISPUTE feedback');
    }

    const feedback = await this.prisma.feedback.create({
      data: {
        id: randomUUID(),
        caseId: id,
        doctorId: user.id,
        feedbackType: isDispute ? FeedbackType.DISPUTE : FeedbackType.VALIDATE,
        correctedSubtype: body.correctSubtype ?? null,
        evidenceTypes: [],
        justification: body.justification ?? null,
        // Both paths feed the model: a correction relabels, a confirmation
        // reinforces the prediction. Either way an AL fine-tune is triggered.
        alTriggered: true,
      },
    });

    await this.prisma.case.update({
      where: { id },
      data: { status: isDispute ? CaseStatus.DISPUTED : CaseStatus.VALIDATED },
    });

    // Fire-and-forget active-learning fine-tune. DISPUTE relabels the case to the
    // corrected subtype; VALIDATE confirms the predicted subtype as ground truth
    // (a confirmed label is training signal too — the model learns on approval).
    const confirmedSubtype = isDispute ? body.correctSubtype! : caseRow.predictedSubtype;
    this.alService.triggerUpdate(
      id,
      confirmedSubtype,
      caseRow.predictedSubtype,
      feedback.id,
      isDispute ? 'DISPUTE' : 'VALIDATE',
    );

    return feedback;
  }
}
