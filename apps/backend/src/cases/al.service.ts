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
    kind: 'VALIDATE' | 'DISPUTE' = 'DISPUTE',
  ): void {
    Promise.resolve().then(async () => {
      try {
        const resp = await firstValueFrom(
          this.http.post(`${this.mlServiceUrl}/feedback`, {
            case_id: caseId,
            correct_subtype: correctSubtype,
            predicted_subtype: predictedSubtype,
            feedback_type: kind,
          }),
        );

        const data = resp.data as any;
        const f1Macro: number = data.f1_macro;
        const f1PerClass: Record<string, number> = data.f1_per_class;
        const accuracy: number = data.accuracy;

        // Allocate the next version from our own metrics history (not the
        // ml-service's in-memory counter, which resets on restart). Retry on the
        // unique modelVersion constraint so concurrent feedback can't lose an
        // update — two near-simultaneous fine-tunes would otherwise collide.
        let newVersion = 0;
        let prevF1 = f1Macro;
        for (let attempt = 0; ; attempt++) {
          const top = await this.prisma.modelMetrics.findFirst({
            orderBy: { modelVersion: 'desc' },
          });
          newVersion = (top?.modelVersion ?? 1) + 1;
          prevF1 = top?.f1Macro ?? f1Macro;
          try {
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
            break;
          } catch (e: any) {
            if (e?.code === 'P2002' && attempt < 4) continue; // version taken, retry
            throw e;
          }
        }

        await this.prisma.feedback.update({
          where: { id: feedbackId },
          data: { newModelVersion: newVersion },
        });

        const f1Delta = Number((f1Macro - prevF1).toFixed(4));

        this.gateway.server.to('doctors').emit('model:updated', {
          modelVersion: newVersion,
          f1Macro,
          f1Delta,
          correctedSubtype: correctSubtype,
          kind,
          caseId,
        });

        this.logger.log(
          `AL ${kind}: model v${newVersion}, F1 ${f1Macro.toFixed(4)} (Δ ${f1Delta >= 0 ? '+' : ''}${f1Delta.toFixed(4)})`,
        );
      } catch (err: any) {
        this.logger.error(`AL trigger failed: ${err?.message}`);
      }
    });
  }
}
