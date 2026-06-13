import { PrismaService } from '../prisma/prisma.service';
import { FlService } from '../fl/fl.service';
export declare class ResearcherService {
    private prisma;
    private flService;
    constructor(prisma: PrismaService, flService: FlService);
    /**
     * Run a live federated test by replaying the *real recorded* convergence
     * curve for the chosen strategy at the requested non-IID level (Dirichlet α).
     * Streams round-by-round over WS. See FlService.streamFlTest for why we replay
     * recorded results instead of re-running the on-frozen-features numpy sim
     * (which cannot distinguish FedAvg from FedSCRT).
     */
    runFlTest(strategy?: string, rounds?: number, alpha?: number): {
        test_id: string;
        status: string;
        strategy: string;
        rounds: number;
    };
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
    /**
     * Privacy/integrity audit for one federated node, computed from real DB rows
     * (contributions + privacy audit logs). Powers the topology "Request Audit"
     * action. Every check is derived, not faked — the headline result is the
     * privacy invariant (#1): 0 bytes of raw patient data ever transmitted.
     */
    getNodeAudit(flClientId: string): Promise<any>;
    /**
     * Downloadable, signed PDF compliance report for a node — the node audit
     * rendered to a shareable document. The auditId (sha1 over node+timestamp)
     * acts as the integrity/signature reference printed on the report.
     */
    getNodeAuditReport(flClientId: string): Promise<{
        buffer: Buffer;
        filename: string;
    } | null>;
    private renderAuditPdf;
    /**
     * Live network insights feed — recent real events merged from users (new
     * signups), cases (new analyses) and FL rounds (model updates). Surfaces the
     * kind of activity a researcher wants to notice, e.g. a patient's first signup.
     */
    getInsights(limit?: number): Promise<any>;
    getOverview(): Promise<any>;
    getTrainingLog(page: number, limit: number): Promise<any>;
    getModelVersions(): Promise<any>;
    getTopology(): Promise<any>;
    getDatasets(): Promise<any>;
    getSystemLogs(page: number, limit: number, severity?: string): Promise<any>;
}
//# sourceMappingURL=researcher.service.d.ts.map