import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
interface PredictionResult {
    predicted_subtype: string;
    confidence: number;
    probs: number[];
    model_version: number;
    strategy: string;
    f1?: number;
    auc?: number;
    hormone_therapy?: string;
}
export declare class InferenceService {
    private configService;
    private httpService;
    private mlServiceUrl;
    constructor(configService: ConfigService, httpService: HttpService);
    getAttention(caseId: string, imagePath?: string): Promise<{
        attention: number[];
        size: number;
        slicePng?: string;
        topSlice?: number;
    }>;
    verifyImage(buffer: Buffer, filename: string): Promise<{
        valid: boolean;
        confidence: number;
        reason: string;
    }>;
    predict(filePath: string): Promise<PredictionResult>;
}
export {};
//# sourceMappingURL=inference.service.d.ts.map