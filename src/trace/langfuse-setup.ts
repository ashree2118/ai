import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

let initialized = false;
let spanProcessor: LangfuseSpanProcessor | null = null;

export function isLangfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY,
  );
}

export function ensureLangfuseOtel(): LangfuseSpanProcessor | null {
  if (!isLangfuseConfigured()) {
    return null;
  }

  if (!initialized) {
    spanProcessor = new LangfuseSpanProcessor();
    const provider = new NodeTracerProvider({
      spanProcessors: [spanProcessor],
    });
    provider.register();
    initialized = true;
  }

  return spanProcessor;
}

export function getLangfuseSpanProcessor(): LangfuseSpanProcessor | null {
  return spanProcessor;
}

export async function flushLangfuseSpans(): Promise<void> {
  await spanProcessor?.forceFlush();
}
