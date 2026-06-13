export declare class PdfService {
    generate(caseData: {
        id: string;
        predictedSubtype: string;
        confidence: number;
        modelVersion: number;
        createdAt: Date;
        probs?: unknown;
        subjectLabel?: string | null;
    }, lang?: string): Promise<Buffer>;
}
//# sourceMappingURL=pdf.service.d.ts.map