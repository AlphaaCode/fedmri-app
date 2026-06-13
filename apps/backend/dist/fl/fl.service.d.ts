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
    handleTestProgress(body: any): Promise<void>;
    /**
     * Stream a *recorded* FL convergence curve round-by-round over WS.
     *
     * The previous implementation proxied to the coordinator's numpy sim, which
     * trains a linear head on already-frozen feature caches — on frozen features
     * "FedAvg" and "FedSCRT" are the same algorithm, so both produced identical
     * curves that also did not match the real experiment results. Here we replay
     * the genuine per-round history measured during the real training runs, so
     * each strategy shows its true, distinct convergence (e.g. at α=0.5 FedAvg
     * tops out ~0.52 macro-F1 while FedSCRT reaches ~0.66).
     */
    streamFlTest(strategy: string, history: {
        round: number;
        f1: number;
        auc: number;
        accuracy: number;
    }[], rounds: number): {
        test_id: string;
        status: string;
        strategy: string;
        rounds: number;
    };
    /**
     * Down/identity-sample a recorded history to exactly `n` points while always
     * keeping the true first and last entries, so the streamed curve preserves
     * the real start and final values regardless of how many rounds the UI asks
     * for.
     */
    private resampleHistory;
    findRounds(page?: number, limit?: number): Promise<{
        data: any[];
        total: number;
    }>;
    findRound(id: string): Promise<any>;
    getHospitalContribution(hospitalId: string): Promise<any>;
    getPrivacyLog(hospitalId: string): Promise<any[]>;
}
//# sourceMappingURL=fl.service.d.ts.map