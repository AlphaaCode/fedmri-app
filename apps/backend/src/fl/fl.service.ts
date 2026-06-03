import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { FlGateway } from './fl.gateway';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { FLStrategy, FLTrigger, PrivacyEvent } from '@prisma/client';

@Injectable()
export class FlService {
  private logger = new Logger(FlService.name);
  private flCoordinatorUrl: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private prisma: PrismaService,
    private gateway: FlGateway,
  ) {
    this.flCoordinatorUrl = this.configService.get<string>(
      'FL_COORDINATOR_URL',
      'http://localhost:8002',
    );
  }

  triggerRound(hospitalId: string, caseId: string): void {
    // Fire-and-forget: do not await, do not throw
    Promise.resolve().then(async () => {
      try {
        const hospital = await this.prisma.hospital.findUnique({
          where: { id: hospitalId },
        });

        if (!hospital) {
          this.logger.error(
            `Hospital ${hospitalId} not found for FL round trigger`,
          );
          return;
        }

        const resp = await firstValueFrom(
          this.httpService.post(`${this.flCoordinatorUrl}/round/start`, {
            hospital_id: hospital.flClientId,
            case_id: caseId,
            trigger: 'DOCTOR_UPLOAD',
          }),
        );

        const roundId = (resp.data as any)?.round_id;
        if (roundId) {
          this.gateway.emitRoundStarted({
            roundId,
            hospitalId,
            caseId,
          });
        }
      } catch (error: any) {
        this.logger.error(`Failed to trigger FL round: ${error?.message}`);
      }
    });
  }

  async handleProgress(body: any): Promise<void> {
    // Map coordinator hospital_id (flClientId) → internal hospitalId for the gateway payload
    const hospital = await this.prisma.hospital.findFirst({
      where: { flClientId: body.hospital_id },
    });

    this.gateway.emitProgress({
      roundId: body.round_id,
      hospitalId: hospital?.id ?? body.hospital_id,
      phase: body.phase,
      epochsDone: body.epochs_done ?? 0,
    });
  }

  async handleRoundComplete(body: any): Promise<void> {
    const roundId: string = body.round_id || randomUUID();
    const roundNumber: number = body.round_number ?? 1;
    const strategyRaw = (body.strategy || 'FEDSCRT').toUpperCase();
    const strategy: FLStrategy =
      strategyRaw === 'FEDAVG' ? FLStrategy.FEDAVG : FLStrategy.FEDSCRT;
    const contributionsIn: any[] = body.contributions || [];
    const triggeredCase: string | undefined = body.triggered_case;

    // Resolve hospitals for every contribution by flClientId
    const flClientIds = contributionsIn.map((c) => c.hospital_id);
    const hospitals = await this.prisma.hospital.findMany({
      where: { flClientId: { in: flClientIds } },
    });
    const hospitalByFlId = new Map(hospitals.map((h) => [h.flClientId, h]));

    const participantIds = hospitals.map((h) => h.id);

    // Create FlRound + nested contributions + privacy logs in a transaction
    const round = await this.prisma.flRound.create({
      data: {
        id: roundId,
        roundNumber,
        strategy,
        participants: { hospitals: participantIds } as any,
        globalF1Before: body.global_f1_before ?? 0,
        globalF1After: body.global_f1_after ?? 0,
        f1PerClassAfter: (body.f1_per_class_after ?? {}) as any,
        durationSeconds: body.duration_seconds ?? 0,
        modelVersion: body.model_version ?? 1,
        triggeredBy: FLTrigger.DOCTOR_UPLOAD,
      },
    });

    for (const c of contributionsIn) {
      const hospital = hospitalByFlId.get(c.hospital_id);
      if (!hospital) {
        this.logger.warn(
          `Unknown hospital flClientId ${c.hospital_id} in contribution`,
        );
        continue;
      }

      await this.prisma.flContribution.create({
        data: {
          id: randomUUID(),
          flRoundId: round.id,
          hospitalId: hospital.id,
          localEpochs: c.local_epochs ?? 0,
          samplesUsed: c.samples_used ?? 0,
          localF1Before: c.local_f1_before ?? 0,
          localF1After: c.local_f1_after ?? 0,
          weightDeltaNorm: c.weight_delta_norm ?? 0,
          privacyBudgetUsed: c.privacy_budget_used ?? 0.1,
        },
      });

      // Privacy audit: invariant #1 — rawDataTransmitted always 0
      await this.prisma.privacyAuditLog.create({
        data: {
          id: randomUUID(),
          flRoundId: round.id,
          hospitalId: hospital.id,
          eventType: PrivacyEvent.WEIGHTS_SENT,
          bytesTransmitted: Math.max(
            0,
            Math.round((c.weight_delta_norm ?? 0.1) * 1_000_000),
          ),
          rawDataTransmitted: 0,
        },
      });
    }

    // Link the triggering case to this round
    if (triggeredCase) {
      try {
        await this.prisma.case.update({
          where: { id: triggeredCase },
          data: { flRoundId: round.id },
        });
      } catch (err: any) {
        this.logger.warn(
          `Could not link case ${triggeredCase} to round ${round.id}: ${err?.message}`,
        );
      }
    }

    // Emit WS event to all connected doctors
    const f1Delta =
      (body.global_f1_after ?? 0) - (body.global_f1_before ?? 0);
    this.gateway.emitRoundComplete({
      roundId: round.id,
      globalF1After: body.global_f1_after ?? 0,
      f1Delta: Number(f1Delta.toFixed(4)),
      modelVersion: body.model_version ?? 1,
    });
  }

  async handleTestProgress(body: any): Promise<void> {
    this.gateway.emitTestProgress({
      testId: body.test_id,
      strategy: body.strategy,
      round: body.round,
      f1: body.f1,
      auc: body.auc,
      accuracy: body.accuracy,
      clientSizes: body.client_sizes ?? [],
    });
    if (body.done) {
      this.gateway.emitTestComplete({
        testId: body.test_id,
        strategy: body.strategy,
        finalF1: body.f1,
      });
    }
  }

  async runFlTest(strategy: string, rounds: number): Promise<any> {
    const resp = await firstValueFrom(
      this.httpService.post(`${this.flCoordinatorUrl}/fl-test/run`, {
        strategy,
        rounds,
      }),
    );
    return resp.data; // { test_id, status, ... }
  }

  async findRounds(
    page = 1,
    limit = 10,
  ): Promise<{ data: any[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.flRound.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.flRound.count(),
    ]);
    return { data, total };
  }

  async findRound(id: string): Promise<any> {
    const round = await this.prisma.flRound.findUnique({
      where: { id },
      include: { contributions: true },
    });
    if (!round) {
      throw new NotFoundException('FL round not found');
    }
    return round;
  }

  async getHospitalContribution(hospitalId: string): Promise<any> {
    const contributions = await this.prisma.flContribution.findMany({
      where: { hospitalId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const totalRounds = contributions.length;
    const totalSamples = contributions.reduce(
      (sum, c) => sum + c.samplesUsed,
      0,
    );
    const avgLocalF1After =
      totalRounds === 0
        ? 0
        : contributions.reduce((s, c) => s + c.localF1After, 0) / totalRounds;
    return {
      hospitalId,
      totalRounds,
      totalSamples,
      avgLocalF1After: Number(avgLocalF1After.toFixed(4)),
      recent: contributions.slice(0, 10),
    };
  }

  async getPrivacyLog(hospitalId: string): Promise<any[]> {
    return this.prisma.privacyAuditLog.findMany({
      where: { hospitalId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
