export type SandboxConfig = {
  image: string;
  cpus: string;
  memory: string;
  timeoutMs: number;
  network: "none" | "bridge";
};

const DEFAULT_IMAGE = "node:22-alpine";
const DEFAULT_CPUS = "1";
const DEFAULT_MEMORY = "512m";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_NETWORK = "none";

export function readSandboxConfig(
  overrides: Partial<SandboxConfig> = {},
): SandboxConfig {
  return {
    image: process.env.SANDBOX_IMAGE ?? DEFAULT_IMAGE,
    cpus: process.env.SANDBOX_CPU ?? DEFAULT_CPUS,
    memory: process.env.SANDBOX_MEMORY ?? DEFAULT_MEMORY,
    timeoutMs: Number(process.env.SANDBOX_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    network:
      process.env.SANDBOX_NETWORK === "bridge" ? "bridge" : DEFAULT_NETWORK,
    ...overrides,
  };
}

export function shouldSandboxTests(override?: boolean): boolean {
  if (override !== undefined) return override;
  const value = process.env.SANDBOX_TESTS?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function isTestCommand(command: string): boolean {
  return /\b(npm test|node --test|vitest|jest|pytest)\b/i.test(command);
}
