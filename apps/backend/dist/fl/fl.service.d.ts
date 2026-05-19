import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
export declare class FlService {
    private configService;
    private httpService;
    private prisma;
    private flCoordinatorUrl;
    constructor(configService: ConfigService, httpService: HttpService, prisma: PrismaService);
    triggerRound(hospitalId: string, caseId: string): void;
    handleRoundComplete(body: any): Promise<void>;
}
//# sourceMappingURL=fl.service.d.ts.map