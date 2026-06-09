import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { FlGateway } from '../fl/fl.gateway';
export declare class AlService {
    private config;
    private http;
    private prisma;
    private gateway;
    private logger;
    private mlServiceUrl;
    constructor(config: ConfigService, http: HttpService, prisma: PrismaService, gateway: FlGateway);
    /**
     * Fire-and-forget AL fine-tune trigger after a doctor disputes a prediction.
     * Same pattern as FL round trigger — returns immediately, work happens async.
     */
    triggerUpdate(caseId: string, correctSubtype: string, predictedSubtype: string, feedbackId: string, kind?: 'VALIDATE' | 'DISPUTE'): void;
}
//# sourceMappingURL=al.service.d.ts.map