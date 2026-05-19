import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FlGateway } from '../fl/fl.gateway';

@Injectable()
export class AlService {
  private logger = new Logger(AlService.name);
  private mlServiceUrl: string;

  constructor(
    private config: ConfigService,
    private http: HttpService,
    private prisma: PrismaService,
    private gateway: FlGateway,
  ) {
    this.mlServiceUrl = this.config.get<string>('ML_SERVICE_URL', 'http://localhost:8001');
  }

  /**
   * Fire-and-forget AL fine-tune trigger after a doctor disputes a prediction.
   * Same pattern as FL round trigger — returns immediately, work happens async.
   */
  triggerUpdate(
    caseId: string,
    correctSubtype: string,
    predictedSubtype: string,
    feedbackId: string,
  ): void {
    Promise.resolve().then(async () => {
      try {
        const resp = await firstValueFrom(
          this.http.post(`${this.mlServiceUrl}/feedback`, {
            case_id: caseId,
            correct_subtype: correctSubtype,
            predicted_subtype: predictedSubtype,
          }),
        );

        const data = resp.data as any;
        const newVersion: number = data.model_version;
        const f1Macro: number = data.f1_macro;
        const f1PerClass: Record<string, number> = data.f1_per_class;
        const accuracy: number = data.accuracy;

        await this.prisma.feedback.update({
          where: { id: feedbackId },
          data: { newModelVersion: newVersion },
        });

        await this.prisma.modelMetrics.create({
          data: {
            id: randomUUID(),
            modelVersion: newVersion,
            flRound: 0, // 0 indicates AL update (not FL round)
            accuracy,
            f1Macro,
            f1PerClass: f1PerClass as any,
            strategy: 'AL',
          },
        });

        // F1 delta vs the previous best version
        const prev = await this.prisma.modelMetrics.findFirst({
          where: { modelVersion: { lt: newVersion } },
          orderBy: { modelVersion: 'desc' },
        });
        const prevF1 = prev?.f1Macro ?? f1Macro;
        const f1Delta = Number((f1Macro - prevF1).toFixed(4));

        this.gateway.server.to('doctors').emit('model:updated', {
          modelVersion: newVersion,
          f1Macro,
          f1Delta,
          correctedSubtype: correctSubtype,
          caseId,
        });

        this.logger.log(
          `AL update: model v${newVersion}, F1 ${f1Macro.toFixed(4)} (Δ ${f1Delta >= 0 ? '+' : ''}${f1Delta.toFixed(4)})`,
        );
      } catch (err: any) {
        this.logger.error(`AL trigger failed: ${err?.message}`);
      }
    });
  }
}
