import { PrismaService } from '../prisma/prisma.service';
import { FlService } from '../fl/fl.service';
export declare class ResearcherService {
    private prisma;
    private flService;
    constructor(prisma: PrismaService, flService: FlService);
    /** Trigger a live federated test run on the coordinator (proxied). */
    runFlTest(strategy?: string, rounds?: number): Promise<any>;
    /** Serve the real FL experiment results (copied into src/fl/experiments). */
    getFlExperiments(): {
        strategy: string;
        alpha: number;
        rounds: number;
        history: {
            round: number;
            f1: number;
            auc: number;
            accuracy: number;
        }[];
        final: {
            f1: number;
            auc: number;
            accuracy: number;
        };
    }[];
    getOverview(): Promise<any>;
    getTrainingLog(page: number, limit: number): Promise<any>;
    getModelVersions(): Promise<any>;
    getTopology(): Promise<any>;
    getDatasets(): Promise<any>;
    getSystemLogs(page: number, limit: number, severity?: string): Promise<any>;
}
//# sourceMappingURL=researcher.service.d.ts.map