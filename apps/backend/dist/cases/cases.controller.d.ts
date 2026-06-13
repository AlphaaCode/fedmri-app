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
    create(user: any, file: Express.Multer.File, body: {
        subjectType?: string;
        subjectLabel?: string;
    }): Promise<any>;
    findAll(user: any, page?: number, limit?: number): Promise<{
        data: any[];
        total: number;
    }>;
    listSamples(): {
        name: string;
    }[];
    createFromSample(user: any, body: {
        name: string;
        subjectType?: string;
        subjectLabel?: string;
    }): Promise<any>;
    findOne(user: any, id: string): Promise<any>;
    getAttention(user: any, id: string): Promise<{
        attention: number[];
        size: number;
        slicePng?: string;
        topSlice?: number;
    }>;
    downloadPdf(user: any, id: string, res: Response): Promise<void>;
    submitFeedback(user: any, id: string, body: {
        type: 'VALIDATE' | 'DISPUTE';
        correctSubtype?: string;
        justification?: string;
    }): Promise<any>;
    update(user: any, id: string, body: {
        clinicalNote?: string;
        subjectType?: string;
        subjectLabel?: string;
    }): Promise<any>;
}
//# sourceMappingURL=cases.controller.d.ts.map