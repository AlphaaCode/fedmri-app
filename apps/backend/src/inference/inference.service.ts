import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { createReadStream } from 'fs';
import { basename } from 'path';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';

interface PredictionResult {
  predicted_subtype: string;
  confidence: number;
  probs: number[];
  model_version: number;
  strategy: string;
  // Additive real-mode fields (FedSCRT). Optional so mock mode is unaffected.
  f1?: number;
  auc?: number;
  hormone_therapy?: string;
}

@Injectable()
export class InferenceService {
  private mlServiceUrl: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.mlServiceUrl = this.configService.get<string>(
      'ML_SERVICE_URL',
      'http://localhost:8001',
    );
  }

  async getAttention(
    caseId: string,
    imagePath?: string,
  ): Promise<{ attention: number[]; size: number; slicePng?: string; topSlice?: number }> {
    const url =
      `${this.mlServiceUrl}/attention/${caseId}` +
      (imagePath ? `?path=${encodeURIComponent(imagePath)}` : '');
    const response = await firstValueFrom(this.httpService.get<any>(url));
    return {
      attention: response.data.attention,
      size: response.data.size,
      slicePng: response.data.slicePng,
      topSlice: response.data.topSlice,
    };
  }

  async verifyImage(buffer: Buffer, filename: string): Promise<{ valid: boolean; confidence: number; reason: string }> {
    const form = new FormData();
    form.append('file', buffer, { filename, contentType: 'image/jpeg' });

    const response = await firstValueFrom(
      this.httpService.post<any>(`${this.mlServiceUrl}/verify`, form, {
        headers: form.getHeaders(),
      }),
    );
    return response.data;
  }

  async predict(filePath: string): Promise<PredictionResult> {
    const fileStream = createReadStream(filePath);
    const fileName = basename(filePath);

    const form = new FormData();
    form.append('file', fileStream, fileName);

    const response = await firstValueFrom(
      this.httpService.post<any>(`${this.mlServiceUrl}/predict`, form, {
        headers: form.getHeaders(),
      }),
    );

    return {
      predicted_subtype: response.data.predicted_subtype,
      confidence: response.data.confidence,
      probs: response.data.probs,
      model_version: response.data.model_version,
      strategy: response.data.strategy,
      f1: response.data.f1,
      auc: response.data.auc,
      hormone_therapy: response.data.hormone_therapy,
    };
  }
}
