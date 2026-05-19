import type { LlmProvider, LlmStreamChunk } from './llm-provider';
/**
 * DeepSeek uses an OpenAI-compatible streaming API.
 * Endpoint: https://api.deepseek.com/chat/completions
 * Models: deepseek-chat, deepseek-reasoner
 */
export declare class DeepSeekProvider implements LlmProvider {
    private apiKey;
    private model;
    private baseUrl;
    private logger;
    constructor(apiKey: string, model?: string, baseUrl?: string);
    stream(systemPrompt: string, userMessage: string): AsyncGenerator<LlmStreamChunk>;
}
//# sourceMappingURL=deepseek.provider.d.ts.map