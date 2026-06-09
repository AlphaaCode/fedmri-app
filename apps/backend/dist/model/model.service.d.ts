import { PrismaService } from '../prisma/prisma.service';
export declare class ModelService {
    private prisma;
    constructor(prisma: PrismaService);
    /**
     * Load the real FL convergence experiments (the same JSONs the researcher
     * federated page serves) so the convergence curve is real per-round data and
     * identical across every portal.
     */
    private loadExperiments;
    /**
     * Convergence curve: F1 macro over FL rounds for each strategy.
     * Source of truth = the real experiment JSONs (alpha=0.5, non-IID). Falls back
     * to live FlRound rows if the experiment files are unavailable. The Centralized
     * line is the flat upper bound (full data access, no federation).
     */
    getHistory(): Promise<any>;
    /**
     * Per-class F1 across strategies (binary: Luminal vs Non-Luminal) — grouped bar.
     */
    getPerClass(): Promise<any>;
    /**
     * Binary confusion matrix. Seeded with the real global-eval confusion
     * (accuracy 0.7027 on the held-out test set), then overlaid with live doctor
     * feedback: a VALIDATE confirms truth = prediction (diagonal); a DISPUTE sets
     * truth = the corrected subtype. Rows = true subtype, columns = predicted.
     */
    getConfusionMatrix(): Promise<any>;
    /**
     * Comparison card: centralized vs FedSCRT gap + privacy framing.
     */
    getComparison(): Promise<any>;
}
//# sourceMappingURL=model.service.d.ts.map