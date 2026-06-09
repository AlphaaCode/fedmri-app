import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { ChatRole } from '@prisma/client';
import type { LlmProvider } from './providers/llm-provider';
import { OllamaProvider } from './providers/ollama.provider';
import { DeepSeekProvider } from './providers/deepseek.provider';

const RATE_LIMIT = 10;
const RATE_WINDOW = 60;

// Accurate, current FedMRI facts so the assistant answers correctly about THIS
// project (binary FedSCRT model). Kept compact — sent on every request.
const FEDMRI_FACTS = `About FedMRI (use these facts; do not invent others):
- Federated learning across 3 hospitals for breast DCE-MRI molecular subtyping. \
Raw patient scans never leave a hospital — only model weight updates are shared \
(0 bytes of raw data transmitted).
- Task is BINARY: Luminal vs Non-Luminal. Luminal ≈ hormone-receptor positive \
(hormone therapy is typically relevant); Non-Luminal ≈ not hormone-receptor driven.
- Model: FedSCRT — a ConvNeXt-Nano per-slice backbone + Gated-Attention MIL head. \
Reported macro-F1 ≈ 0.66, AUC ≈ 0.68, accuracy ≈ 0.70 under non-IID data (Dirichlet α=0.5).
- Aggregation strategies compared: FedAvg, server Momentum, SCAFFOLD, and FedSCRT \
(FedSCRT performs best under non-IID).
- The attention map (Gated-Attention MIL) shows which MRI slices/regions most \
influenced the prediction.
- Active learning: when a doctor confirms or corrects a prediction, the model \
fine-tunes on that label and the model version increments.`;

const DOCTOR_SYSTEM = (ctx: string) => `You are a clinical AI assistant for oncologists \
using the FedMRI federated learning system.
${FEDMRI_FACTS}
Current case context:
${ctx}
Answer clinical questions about the prediction, explain the federated-learning process, \
suggest literature, and help interpret the attention map. You may use medical terminology. \
Never fabricate citations or numbers. If unsure, say so. Be concise — 3 short paragraphs maximum.`;

const PATIENT_SYSTEM = `You are a supportive health guide for patients using an AI breast \
MRI analysis tool. The AI was trained across 3 hospitals without sharing any patient records.
What the result types mean, in plain language (only if asked):
- "Luminal" generally describes hormone-sensitive breast tissue, where hormone-based \
therapies are often part of care.
- "Non-Luminal" generally describes tissue that is not hormone-driven, where other \
treatments are usually considered.
Rules you must always follow:
1. Never give a clinical diagnosis, treatment recommendation, or medication advice.
2. Always recommend consulting a certified oncologist for medical decisions.
3. Use plain language — no jargon, and never use the words "federated learning", \
"gradient", "weight delta", "MIL", or "model". Say "AI trained across 3 hospitals" instead.
4. If asked about prognosis or survival rates, acknowledge the question warmly then redirect to their oncologist.
5. If asked about the AI result, explain in lay terms what the type means generally. \
Never say "you have" or "you don't have" cancer.
Be warm, concise, and reassuring. Keep responses under 4 short paragraphs.`;

@Injectable()
export class ChatService {
  private logger = new Logger(ChatService.name);
  private redis: Redis;
  private provider: LlmProvider;
  private providerName: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.redis = new Redis(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );

    this.providerName = (this.config.get<string>('LLM_PROVIDER', 'ollama') || 'ollama').toLowerCase();

    switch (this.providerName) {
      case 'deepseek': {
        const key = this.config.get<string>('DEEPSEEK_API_KEY', '');
        if (!key) this.logger.warn('LLM_PROVIDER=deepseek but DEEPSEEK_API_KEY missing');
        this.provider = new DeepSeekProvider(
          key,
          this.config.get<string>('DEEPSEEK_MODEL', 'deepseek-chat'),
        );
        break;
      }
      case 'ollama':
      default: {
        const baseUrl = this.config.get<string>('OLLAMA_URL', 'http://localhost:11434');
        const model = this.config.get<string>('OLLAMA_MODEL', 'llama3.2:3b');
        this.provider = new OllamaProvider(baseUrl, model);
        this.providerName = 'ollama';
        break;
      }
    }

    this.logger.log(`LLM provider initialised: ${this.providerName}`);
  }

  async checkRateLimit(userId: string): Promise<boolean> {
    const key = `chat_rate:${userId}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, RATE_WINDOW);
    return count <= RATE_LIMIT;
  }

  async buildSystemPrompt(
    role: 'doctor' | 'patient',
    caseId?: string,
  ): Promise<string> {
    if (role === 'patient') return PATIENT_SYSTEM;

    let ctx = 'No specific case loaded.';
    if (caseId) {
      const c = await this.prisma.case.findUnique({
        where: { id: caseId },
        include: { flRound: true },
      });
      if (c) {
        ctx = `Case ID: ${c.id}
Predicted subtype: ${c.predictedSubtype}
Confidence: ${(c.confidence * 100).toFixed(1)}%
Model version: ${c.modelVersion}
Status: ${c.status}
FL strategy: ${c.flRound?.strategy ?? 'N/A'}
Global F1 after round: ${c.flRound ? (c.flRound.globalF1After * 100).toFixed(1) + '%' : 'N/A'}
Created: ${c.createdAt.toISOString().split('T')[0]}`;
      }
    }
    return DOCTOR_SYSTEM(ctx);
  }

  async *streamResponse(
    userId: string,
    role: 'doctor' | 'patient',
    content: string,
    caseId?: string,
  ): AsyncGenerator<{ token: string; done: boolean }> {
    const systemPrompt = await this.buildSystemPrompt(role, caseId);

    await this.prisma.chatMessage.create({
      data: {
        id: randomUUID(),
        userId,
        caseId: caseId ?? null,
        role: ChatRole.USER,
        content,
      },
    });

    let fullResponse = '';

    try {
      for await (const chunk of this.provider.stream(systemPrompt, content)) {
        if (chunk.token) fullResponse += chunk.token;
        yield chunk;
        if (chunk.done) break;
      }

      await this.prisma.chatMessage.create({
        data: {
          id: randomUUID(),
          userId,
          caseId: caseId ?? null,
          role: ChatRole.ASSISTANT,
          content: fullResponse,
        },
      });
    } catch (err: any) {
      this.logger.error(`[${this.providerName}] stream error: ${err?.message}`);
      yield { token: '', done: true };
      throw err;
    }
  }

  async getHistory(userId: string, limit = 50): Promise<any[]> {
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}
