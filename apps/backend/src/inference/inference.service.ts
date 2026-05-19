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
    };
  }
}
