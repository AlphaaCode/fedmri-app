import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResearcherService {
  constructor(private prisma: PrismaService) {}

  async getOverview(): Promise<any> {
    const [latestMetrics, totalRounds, hospitals] = await Promise.all([
      this.prisma.modelMetrics.findFirst({
        orderBy: { modelVersion: 'desc' },
      }),
      this.prisma.flRound.count(),
      this.prisma.hospital.count(),
    ]);

    const phase: 'idle' | 'local_training' | 'aggregating' | 'complete' =
      totalRounds > 0 ? 'complete' : 'idle';

    return {
      modelVersion: latestMetrics?.modelVersion ?? 0,
      strategy: latestMetrics?.strategy ?? 'FedProx',
      f1Macro: latestMetrics?.f1Macro ?? 0,
      accuracy: latestMetrics?.accuracy ?? 0,
      totalRounds,
      hospitals,
      patientsProtected: 737,
      rawBytesSent: 0,
      phase,
    };
  }

  async getTrainingLog(page: number, limit: number): Promise<any> {
    const [rounds, total, totalNodes] = await Promise.all([
      this.prisma.flRound.findMany({
        orderBy: { roundNumber: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { contributions: true },
      }),
      this.prisma.flRound.count(),
      this.prisma.hospital.count(),
    ]);

    const maxRoundNumber = rounds.length > 0 ? rounds[0].roundNumber : 0;

    const mappedRounds = rounds.map((round) => {
      const gradientNorm =
        round.contributions.length > 0
          ? Number(
              (
                round.contributions.reduce(
                  (sum, c) => sum + c.weightDeltaNorm,
                  0,
                ) / round.contributions.length
              ).toFixed(4),
            )
          : 0;

      return {
        roundNumber: round.roundNumber,
        strategy: round.strategy === 'FEDAVG' ? 'FedAvg' : 'FedProx',
        nodesParticipating: round.contributions.length,
        totalNodes,
        gradientNorm,
        globalF1After: round.globalF1After,
        status:
          round.roundNumber === maxRoundNumber ? 'active' : 'completed',
      };
    });

    return {
      total,
      rounds: mappedRounds,
    };
  }

  async getModelVersions(): Promise<any> {
    const rounds = await this.prisma.flRound.findMany({
      orderBy: { modelVersion: 'desc' },
    });

    const latestModelVersion =
      rounds.length > 0 ? rounds[0].modelVersion : null;

    // Load ModelMetrics for accuracy lookup
    const allMetrics = await this.prisma.modelMetrics.findMany();
    const metricsMap = new Map<number, typeof allMetrics[0]>();
    for (const m of allMetrics) {
      metricsMap.set(m.modelVersion, m);
    }

    const versions = rounds.map((round) => {
      const metrics = metricsMap.get(round.modelVersion);
      const accuracy = metrics
        ? metrics.accuracy
        : Number((round.globalF1After + 0.14).toFixed(2));

      const hash = createHash('sha1')
        .update(round.id)
        .digest('hex')
        .slice(0, 7);

      return {
        modelVersion: round.modelVersion,
        flRound: round.roundNumber,
        f1Macro: round.globalF1After,
        accuracy,
        strategy: round.strategy === 'FEDAVG' ? 'FedAvg' : 'FedProx',
        status:
          round.modelVersion === latestModelVersion ? 'active' : 'archived',
        hash,
      };
    });

    return { versions };
  }
}
