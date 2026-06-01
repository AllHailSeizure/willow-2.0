import Anthropic from '@anthropic-ai/sdk';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Streams a chat response from Claude.
 * Calls onToken for each text delta received, resolves when the stream is complete.
 */
export async function streamChat(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  onToken: (text: string) => void
): Promise<void> {
  const client = new Anthropic({ apiKey });

  const stream = await client.messages.stream({
    model,
    max_tokens: 4096,
    system:
      'You are Claude, an AI coding assistant integrated into VS Code. ' +
      'You have access to the user\'s current file and selection when provided. ' +
      'When writing code, use markdown code blocks with the appropriate language identifier. ' +
      'Be concise and helpful.',
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      onToken(event.delta.text);
    }
  }

  await stream.finalMessage();
}
