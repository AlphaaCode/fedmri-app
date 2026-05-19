import { PrismaService } from '../prisma/prisma.service';
export declare class ModelService {
    private prisma;
    constructor(prisma: PrismaService);
    /**
     * Convergence curve: F1 macro over FL rounds for each strategy.
     * Builds the curve from FlRound + thesis baseline for the "Centralized" line.
     */
    getHistory(): Promise<any>;
    /**
     * Per-class F1 across strategies — for grouped bar chart.
     */
    getPerClass(): Promise<any>;
    /**
     * Confusion matrix from feedback data.
     * Rows = true (corrected) subtype, columns = predicted subtype.
     */
    getConfusionMatrix(): Promise<any>;
    /**
     * Comparison card: centralized vs FedProx gap + privacy framing.
     */
    getComparison(): Promise<any>;
}
//# sourceMappingURL=model.service.d.ts.map