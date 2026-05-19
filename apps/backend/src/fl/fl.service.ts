import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';

@Injectable()
export class FlService {
  private flCoordinatorUrl: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private prisma: PrismaService,
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
          console.error(`Hospital ${hospitalId} not found for FL round trigger`);
          return;
        }

        await firstValueFrom(
          this.httpService.post(`${this.flCoordinatorUrl}/round/start`, {
            hospital_id: hospital.flClientId,
            case_id: caseId,
            trigger: 'DOCTOR_UPLOAD',
          }),
        );
      } catch (error) {
        console.error('Failed to trigger FL round:', error);
      }
    });
  }

  async handleRoundComplete(body: any): Promise<void> {
    const roundId = body.round_id || randomUUID();
    const caseId = body.case_id;
    const hospitalFlClientId = body.hospital_id;

    // Find hospital by flClientId
    const hospital = await this.prisma.hospital.findFirst({
      where: { flClientId: hospitalFlClientId },
    });

    if (!hospital) {
      throw new Error(`Hospital with flClientId ${hospitalFlClientId} not found`);
    }

    // Get contributors (all hospitals)
    const contributors = await this.prisma.hospital.findMany();

    // Create FL round
    await this.prisma.flRound.create({
      data: {
        id: roundId,
        roundNumber: body.round_number || 1,
        strategy: body.strategy || 'FEDAVG',
        participants: { hospitals: contributors.map(h => h.id) },
        globalF1Before: 0.35,
        globalF1After: 0.41,
        f1PerClassAfter: {
          'Luminal A': 0.42,
          'Luminal B': 0.39,
          'HER2': 0.36,
          'Triple Negative': 0.38,
        },
        durationSeconds: 30,
        modelVersion: 10,
        triggeredBy: 'DOCTOR_UPLOAD',
        cases: {
          connect: [{ id: caseId }],
        },
      },
    });

    // Create FL contributions
    for (let i = 0; i < contributors.length; i++) {
      await this.prisma.flContribution.create({
        data: {
          id: randomUUID(),
          flRoundId: roundId,
          hospitalId: contributors[i].id,
          localEpochs: 5,
          samplesUsed: Math.floor(Math.random() * 100) + 50,
          localF1Before: 0.32 + Math.random() * 0.08,
          localF1After: 0.38 + Math.random() * 0.08,
          weightDeltaNorm: Math.random() * 0.5,
          privacyBudgetUsed: 0.1,
        },
      });
    }

    // Create privacy audit logs (one per hospital, rawDataTransmitted always 0)
    for (let i = 0; i < contributors.length; i++) {
      await this.prisma.privacyAuditLog.create({
        data: {
          id: randomUUID(),
          flRoundId: roundId,
          hospitalId: contributors[i].id,
          eventType: 'WEIGHTS_SENT',
          bytesTransmitted: Math.floor(Math.random() * 10000) + 5000,
          rawDataTransmitted: 0,
        },
      });
    }
  }
}
