export interface LlmStreamChunk {
  token: string;
  done: boolean;
}

export interface LlmProvider {
  /**
   * Stream a chat completion token by token.
   * The final yielded chunk MUST have done=true.
   */
  stream(
    systemPrompt: string,
    userMessage: string,
  ): AsyncGenerator<LlmStreamChunk>;
}
