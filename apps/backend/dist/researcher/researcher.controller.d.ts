import { ResearcherService } from './researcher.service';
export declare class ResearcherController {
    private svc;
    constructor(svc: ResearcherService);
    overview(): Promise<any>;
    trainingLog(page?: string, limit?: string): Promise<any>;
    modelVersions(): Promise<any>;
    flExperiments(): {
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
    flTest(body: {
        strategy?: string;
        rounds?: number;
    }): Promise<any>;
    topology(): Promise<any>;
    datasets(): Promise<any>;
    systemLogs(page?: string, limit?: string, severity?: string): Promise<any>;
}
//# sourceMappingURL=researcher.controller.d.ts.map