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
    createFromSample(user: any, name: string): Promise<any>;
    create(user: any, file: Express.Multer.File): Promise<any>;
    findAll(user: any, query?: {
        page?: number;
        limit?: number;
    }): Promise<{
        data: any[];
        total: number;
    }>;
    getAttention(user: any, id: string): Promise<{
        attention: number[];
        size: number;
        slicePng?: string;
        topSlice?: number;
    }>;
    findOne(user: any, id: string): Promise<any>;
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