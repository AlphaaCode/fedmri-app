import { Logger } from '@nestjs/common';
import type { LlmProvider, LlmStreamChunk } from './llm-provider';

export class OllamaProvider implements LlmProvider {
  private logger = new Logger('OllamaProvider');

  constructor(
    private baseUrl: string,
    private model: string,
  ) {}

  async *stream(
    systemPrompt: string,
    userMessage: string,
  ): AsyncGenerator<LlmStreamChunk> {
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
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Ollama streams JSONL — one JSON object per line
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          if (obj.message?.content) {
            yield { token: obj.message.content, done: false };
          }
          if (obj.done) {
            yield { token: '', done: true };
            return;
          }
        } catch (err) {
          this.logger.warn(`Failed to parse Ollama line: ${trimmed.slice(0, 80)}`);
        }
      }
    }

    yield { token: '', done: true };
  }
}
