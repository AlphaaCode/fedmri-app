import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { FlGateway } from './fl.gateway';
export declare class FlService {
    private configService;
    private httpService;
    private prisma;
    private gateway;
    private logger;
    private flCoordinatorUrl;
    constructor(configService: ConfigService, httpService: HttpService, prisma: PrismaService, gateway: FlGateway);
    triggerRound(hospitalId: string, caseId: string): void;
    handleProgress(body: any): Promise<void>;
    handleRoundComplete(body: any): Promise<void>;
    findRounds(page?: number, limit?: number): Promise<{
        data: any[];
        total: number;
    }>;
    findRound(id: string): Promise<any>;
    getHospitalContribution(hospitalId: string): Promise<any>;
    getPrivacyLog(hospitalId: string): Promise<any[]>;
}
//# sourceMappingURL=fl.service.d.ts.map