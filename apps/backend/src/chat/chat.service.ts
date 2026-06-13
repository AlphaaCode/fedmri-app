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
const FEDMRI_FACTS = `About the FedMRI app (use these facts; do not invent others):
- What it is: an educational web app that classifies the molecular subtype of \
breast cancer from a DCE-MRI scan. A clinician uploads a breast MRI volume; the AI \
returns a predicted subtype with a confidence score, an attention heat-map of the \
slices/regions that drove the prediction, and a downloadable report.
- Two portals: a Doctor portal (a hospital participating in the network — scans stay \
inside that hospital) and a Patient portal (consumes the shared global model without \
being part of training).
- Federated learning across 3 hospitals: raw patient scans never leave a hospital — \
only model weight updates are shared (0 bytes of raw data transmitted).
- Task is BINARY: Luminal vs Non-Luminal. Luminal ≈ hormone-receptor positive \
(endocrine/hormone therapy is typically relevant); Non-Luminal ≈ not hormone-receptor \
driven (HER2-enriched and triple-negative collapse into this class).
- Model: FedSCRT — a ConvNeXt-Nano per-slice backbone + Gated-Attention MIL head. \
Reported macro-F1 ≈ 0.66, AUC ≈ 0.68, accuracy ≈ 0.70 under non-IID data (Dirichlet α=0.5).
- Aggregation strategies compared: FedAvg, server Momentum, SCAFFOLD, and FedSCRT \
(FedSCRT performs best under non-IID).
- The attention map (Gated-Attention MIL) shows which MRI slices/regions most \
influenced the prediction.
- Active learning: when a doctor confirms or corrects a prediction, the model \
fine-tunes on that label and the model version increments.`;

// General oncology reference so the assistant can answer subtype / treatment
// questions correctly. Background knowledge — not specific to a single case.
const CLINICAL_REFERENCE = `General breast-cancer reference (standard oncology; \
state these as general information, not a treatment order):
- The four intrinsic molecular subtypes: Luminal A, Luminal B, HER2-enriched, and \
Triple-Negative (TN). FedMRI collapses these to Luminal (hormone-receptor positive) \
vs Non-Luminal (HER2-enriched + TN).
- Luminal A (ER/PR+, HER2−, low Ki-67): best prognosis; endocrine therapy \
(tamoxifen or an aromatase inhibitor) is the mainstay, chemo often avoidable.
- Luminal B (ER+, high Ki-67 and/or HER2+): endocrine therapy, frequently with \
chemotherapy, plus anti-HER2 agents if HER2+.
- HER2-enriched (HER2+, ER/PR−): HER2-targeted therapy (trastuzumab ± pertuzumab) \
combined with chemotherapy.
- Triple-Negative (ER/PR/HER2 all −): chemotherapy-based; immunotherapy or PARP \
inhibitors in selected cases; no hormone or HER2 target.
- Why MRI: dynamic contrast-enhanced (DCE) MRI captures tumour vascularity and \
enhancement kinetics that correlate with these subtypes, enabling non-invasive \
subtype estimation that complements biopsy/IHC.
- Clinical framing: subtype guides systemic therapy choice (endocrine vs anti-HER2 \
vs chemo) and prognosis. An AI estimate supports — never replaces — biopsy, IHC, \
and the tumour board.`;

const DOCTOR_SYSTEM = (ctx: string) => `You are a clinical AI assistant for oncologists \
using the FedMRI federated learning system. You understand both how the FedMRI app \
works and the underlying breast-cancer oncology.
${FEDMRI_FACTS}
${CLINICAL_REFERENCE}
Current case context:
${ctx}
Answer questions about the app and workflow, the prediction, the federated-learning \
process, molecular subtypes and their typical treatment pathways, and how to read the \
attention heat-map (the Gated-Attention MIL map highlights the MRI slices/regions that \
most influenced the prediction — hotter/brighter = more influential; relate this to the \
enhancement patterns typical of the predicted subtype); suggest relevant literature directions. You may use medical \
terminology. Never fabricate citations or numbers, and frame treatment information as \
general guidance that defers to biopsy/IHC and the treating team. If unsure, say so. \
Be concise — 3 short paragraphs maximum.`;

const PATIENT_SYSTEM = `You are a supportive health guide for patients using an AI breast \
MRI analysis tool. The AI was trained across 3 hospitals without sharing any patient records.
About this tool, in plain language (only if asked):
- A breast MRI scan is uploaded, and the AI gives an estimate of the breast-tissue type \
along with a confidence level and a picture that highlights the areas it looked at most. \
It is a second-opinion aid that supports — never replaces — your medical team.
What the result types mean, in plain language (only if asked):
- "Luminal" generally describes hormone-sensitive breast tissue, where hormone-based \
therapies are often part of care.
- "Non-Luminal" generally describes tissue that is not hormone-driven, where other \
treatments (such as chemotherapy or targeted therapy) are usually considered.
- Doctors group breast tissue into a few general types; treatment is always chosen by \
an oncologist based on a biopsy and your full medical picture, not on a scan alone.
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
