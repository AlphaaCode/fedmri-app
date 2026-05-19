import { Logger } from '@nestjs/common';
import type { LlmProvider, LlmStreamChunk } from './llm-provider';

/**
 * DeepSeek uses an OpenAI-compatible streaming API.
 * Endpoint: https://api.deepseek.com/chat/completions
 * Models: deepseek-chat, deepseek-reasoner
 */
export class DeepSeekProvider implements LlmProvider {
  private logger = new Logger('DeepSeekProvider');

  constructor(
    private apiKey: string,
    private model: string = 'deepseek-chat',
    private baseUrl: string = 'https://api.deepseek.com',
  ) {}

  async *stream(
    systemPrompt: string,
    userMessage: string,
  ): AsyncGenerator<LlmStreamChunk> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
        temperature: 0.4,
        max_tokens: 1024,
      }),
    });

    if (!res.ok || !res.body) {
      const errBody = await res.text().catch(() => '');
      this.logger.error(`DeepSeek HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      throw new Error(`DeepSeek returned ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const raw of lines) {
        const line = raw.trim();
        if (!line || !line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          yield { token: '', done: true };
          return;
        }
        try {
          const obj = JSON.parse(payload);
          const tok = obj.choices?.[0]?.delta?.content;
          if (tok) yield { token: tok, done: false };
        } catch (err) {
          this.logger.warn(`Failed to parse DeepSeek SSE line: ${payload.slice(0, 80)}`);
        }
      }
    }

    yield { token: '', done: true };
  }
}
