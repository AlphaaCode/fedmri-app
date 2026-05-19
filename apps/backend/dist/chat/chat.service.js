"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var ChatService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const ioredis_1 = __importDefault(require("ioredis"));
const crypto_1 = require("crypto");
const client_1 = require("@prisma/client");
const ollama_provider_1 = require("./providers/ollama.provider");
const deepseek_provider_1 = require("./providers/deepseek.provider");
const RATE_LIMIT = 10;
const RATE_WINDOW = 60;
const DOCTOR_SYSTEM = (ctx) => `You are a clinical AI assistant for oncologists \
using the FedMRI federated learning system. You have access to the following case context:
${ctx}
Answer clinical questions about the prediction, explain the FL process, suggest literature, \
and help interpret the attention map. You may use medical terminology. \
Never fabricate citations. If unsure, say so. Be concise — 3 short paragraphs maximum.`;
const PATIENT_SYSTEM = `You are a supportive health guide for patients using an AI breast \
MRI analysis tool. The AI was trained across 3 hospitals without sharing any patient records.
Rules you must always follow:
1. Never give clinical diagnosis, treatment recommendations, or medication advice.
2. Always recommend consulting a certified oncologist for medical decisions.
3. Use plain language — no jargon, no acronyms without explanation.
4. If asked about prognosis or survival rates, acknowledge the question warmly then redirect to their oncologist.
5. If asked about the AI prediction, explain in lay terms what the subtype means generally. \
Never say "you have" or "you don't have" cancer.
Be warm, concise, and reassuring. Keep responses under 4 short paragraphs.`;
let ChatService = ChatService_1 = class ChatService {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
        this.logger = new common_1.Logger(ChatService_1.name);
        this.redis = new ioredis_1.default(this.config.get('REDIS_URL', 'redis://localhost:6379'));
        this.providerName = (this.config.get('LLM_PROVIDER', 'ollama') || 'ollama').toLowerCase();
        switch (this.providerName) {
            case 'deepseek': {
                const key = this.config.get('DEEPSEEK_API_KEY', '');
                if (!key)
                    this.logger.warn('LLM_PROVIDER=deepseek but DEEPSEEK_API_KEY missing');
                this.provider = new deepseek_provider_1.DeepSeekProvider(key, this.config.get('DEEPSEEK_MODEL', 'deepseek-chat'));
                break;
            }
            case 'ollama':
            default: {
                const baseUrl = this.config.get('OLLAMA_URL', 'http://localhost:11434');
                const model = this.config.get('OLLAMA_MODEL', 'llama3.2:3b');
                this.provider = new ollama_provider_1.OllamaProvider(baseUrl, model);
                this.providerName = 'ollama';
                break;
            }
        }
        this.logger.log(`LLM provider initialised: ${this.providerName}`);
    }
    async checkRateLimit(userId) {
        const key = `chat_rate:${userId}`;
        const count = await this.redis.incr(key);
        if (count === 1)
            await this.redis.expire(key, RATE_WINDOW);
        return count <= RATE_LIMIT;
    }
    async buildSystemPrompt(role, caseId) {
        if (role === 'patient')
            return PATIENT_SYSTEM;
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
    async *streamResponse(userId, role, content, caseId) {
        const systemPrompt = await this.buildSystemPrompt(role, caseId);
        await this.prisma.chatMessage.create({
            data: {
                id: (0, crypto_1.randomUUID)(),
                userId,
                caseId: caseId ?? null,
                role: client_1.ChatRole.USER,
                content,
            },
        });
        let fullResponse = '';
        try {
            for await (const chunk of this.provider.stream(systemPrompt, content)) {
                if (chunk.token)
                    fullResponse += chunk.token;
                yield chunk;
                if (chunk.done)
                    break;
            }
            await this.prisma.chatMessage.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    userId,
                    caseId: caseId ?? null,
                    role: client_1.ChatRole.ASSISTANT,
                    content: fullResponse,
                },
            });
        }
        catch (err) {
            this.logger.error(`[${this.providerName}] stream error: ${err?.message}`);
            yield { token: '', done: true };
            throw err;
        }
    }
    async getHistory(userId, limit = 50) {
        return this.prisma.chatMessage.findMany({
            where: { userId },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = ChatService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], ChatService);
//# sourceMappingURL=chat.service.js.map