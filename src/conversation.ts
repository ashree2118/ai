import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  Usage,
} from "@anthropic-ai/sdk/resources/messages/messages";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export type ConversationOptions = {
  system?: string;
  model?: string;
  maxTokens?: number;
  client?: Anthropic;
};

export type SendResult = {
  text: string;
  usage: Usage;
};

function extractText(content: Message["content"]): string {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function printUsage(usage: Usage): void {
  console.log(
    `tokens: input=${usage.input_tokens} output=${usage.output_tokens}`,
  );
}

export class Conversation {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private system?: string;
  private messages: MessageParam[] = [];

  constructor(options: ConversationOptions = {}) {
    this.client = options.client ?? new Anthropic();
    this.model =
      options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? 1024;
    this.system = options.system;
  }

  get history(): readonly MessageParam[] {
    return this.messages;
  }

  setSystem(system: string | undefined): void {
    this.system = system;
  }

  reset(): void {
    this.messages = [];
  }

  async send(userText: string): Promise<SendResult> {
    this.messages.push({ role: "user", content: userText });

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: this.system,
      messages: this.messages,
    });

    const text = extractText(response.content);
    this.messages.push({ role: "assistant", content: text });

    printUsage(response.usage);

    return { text, usage: response.usage };
  }
}
