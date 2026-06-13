import { PrismaService } from '../prisma/prisma.service';
import { InferenceService } from '../inference/inference.service';
import { FlService } from '../fl/fl.service';
import { AlService } from './al.service';
export declare class CasesService {
    private prisma;
    private inferenceService;
    private flService;
    private alService;
    constructor(prisma: PrismaService, inferenceService: InferenceService, flService: FlService, alService: AlService);
    private samplesDir;
    /** List bundled sample MRI volumes (for the "Use a sample scan" picker). */
    listSamples(): {
        name: string;
    }[];
    /** Create a case from a bundled sample volume (runs the same real pipeline). */
    createFromSample(user: any, name: string, meta?: {
        subjectType?: string;
        subjectLabel?: string;
    }): Promise<any>;
    create(user: any, file: Express.Multer.File, meta?: {
        subjectType?: string;
        subjectLabel?: string;
    }): Promise<any>;
    findAll(user: any, query?: {
        page?: number;
        limit?: number;
    }): Promise<{
        data: any[];
        total: number;
    }>;
    /**
     * Active-learning review queue: the cases the model is LEAST sure about
     * (confidence closest to 0.5), still PENDING, scoped to the caller's silo.
     * The doctor labels these first — uncertainty sampling — and each label feeds
     * the AL fine-tune. uncertainty = 1 − |conf − 0.5|·2 (1 = maximally unsure).
     */
    getReviewQueue(user: any, limit?: number): Promise<any[]>;
    getAttention(user: any, id: string): Promise<{
        attention: number[];
        size: number;
        slicePng?: string;
        topSlice?: number;
    }>;
    findOne(user: any, id: string): Promise<any>;
    /**
     * Update editable, doctor-owned fields of a case: the clinical note and the
     * subject attribution (patient label / TEST). Silo-checked via findOne, and
     * only the owning role may edit (doctors edit hospital cases; patients can
     * annotate their own). Never touches prediction/privacy fields.
     */
    updateCase(user: any, id: string, body: {
        clinicalNote?: string;
        subjectType?: string;
        subjectLabel?: string;
    }): Promise<any>;
    verifyImage(file: Express.Multer.File): Promise<{
        valid: boolean;
        confidence: number;
        reason: string;
    }>;
    submitFeedback(user: any, id: string, body: {
        type: 'VALIDATE' | 'DISPUTE';
        correctSubtype?: string;
        justification?: string;
    }): Promise<any>;
}
//# sourceMappingURL=cases.service.d.ts.map