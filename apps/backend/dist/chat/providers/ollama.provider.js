"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaProvider = void 0;
const common_1 = require("@nestjs/common");
class OllamaProvider {
    constructor(baseUrl, model) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.logger = new common_1.Logger('OllamaProvider');
    }
    async *stream(systemPrompt, userMessage) {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                stream: true,
                options: {
                    temperature: 0.4,
                    num_ctx: 4096,
                },
            }),
        });
        if (!res.ok || !res.body) {
            const errBody = await res.text().catch(() => '');
            this.logger.error(`Ollama HTTP ${res.status}: ${errBody.slice(0, 200)}`);
            throw new Error(`Ollama returned ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            // Ollama streams JSONL — one JSON object per line
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                try {
                    const obj = JSON.parse(trimmed);
                    if (obj.message?.content) {
                        yield { token: obj.message.content, done: false };
                    }
                    if (obj.done) {
                        yield { token: '', done: true };
                        return;
                    }
                }
                catch (err) {
                    this.logger.warn(`Failed to parse Ollama line: ${trimmed.slice(0, 80)}`);
                }
            }
        }
        yield { token: '', done: true };
    }
}
exports.OllamaProvider = OllamaProvider;
//# sourceMappingURL=ollama.provider.js.map