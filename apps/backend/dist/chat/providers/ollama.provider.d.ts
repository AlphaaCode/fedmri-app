import type { LlmProvider, LlmStreamChunk } from './llm-provider';
export declare class OllamaProvider implements LlmProvider {
    private baseUrl;
    private model;
    private logger;
    constructor(baseUrl: string, model: string);
    stream(systemPrompt: string, userMessage: string): AsyncGenerator<LlmStreamChunk>;
}
//# sourceMappingURL=ollama.provider.d.ts.map