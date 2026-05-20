import type { Response } from 'express';
import { PdfService } from './pdf.service';
import { CasesService } from './cases.service';
export declare class CasesController {
    private casesService;
    private pdfService;
    constructor(casesService: CasesService, pdfService: PdfService);
    verify(file: Express.Multer.File): Promise<{
        valid: boolean;
        confidence: number;
        reason: string;
    }>;
    create(user: any, file: Express.Multer.File): Promise<any>;
    findAll(user: any, page?: number, limit?: number): Promise<{
        data: any[];
        total: number;
    }>;
    findOne(user: any, id: string): Promise<any>;
    getAttention(user: any, id: string): Promise<{
        attention: number[];
        size: number;
    }>;
    downloadPdf(user: any, id: string, res: Response): Promise<void>;
    submitFeedback(user: any, id: string, body: {
        type: 'VALIDATE' | 'DISPUTE';
        correctSubtype?: string;
        justification?: string;
    }): Promise<any>;
}
//# sourceMappingURL=cases.controller.d.ts.map