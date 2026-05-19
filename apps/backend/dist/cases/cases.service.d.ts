import { PrismaService } from '../prisma/prisma.service';
import { InferenceService } from '../inference/inference.service';
import { FlService } from '../fl/fl.service';
export declare class CasesService {
    private prisma;
    private inferenceService;
    private flService;
    constructor(prisma: PrismaService, inferenceService: InferenceService, flService: FlService);
    create(user: any, file: Express.Multer.File): Promise<any>;
    findAll(user: any, query?: {
        page?: number;
        limit?: number;
    }): Promise<{
        data: any[];
        total: number;
    }>;
    findOne(user: any, id: string): Promise<any>;
}
//# sourceMappingURL=cases.service.d.ts.map