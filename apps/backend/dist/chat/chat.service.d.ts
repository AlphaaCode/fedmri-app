import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export declare class ChatService {
    private prisma;
    private config;
    private logger;
    private redis;
    private provider;
    private providerName;
    constructor(prisma: PrismaService, config: ConfigService);
    checkRateLimit(userId: string): Promise<boolean>;
    buildSystemPrompt(role: 'doctor' | 'patient', caseId?: string): Promise<string>;
    streamResponse(userId: string, role: 'doctor' | 'patient', content: string, caseId?: string): AsyncGenerator<{
        token: string;
        done: boolean;
    }>;
    getHistory(userId: string, limit?: number): Promise<any[]>;
}
//# sourceMappingURL=chat.service.d.ts.map