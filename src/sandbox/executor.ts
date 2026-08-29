import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  isTestCommand,
  readSandboxConfig,
  shouldSandboxTests,
  type SandboxConfig,
} from "./config.js";

const execFileAsync = promisify(execFile);

export { isTestCommand, shouldSandboxTests };

export type SandboxResult = {
  exitCode: number;
  output: string;
  timedOut: boolean;
  containerName: string;
};

export type SandboxRunOptions = Partial<SandboxConfig> & {
  workspaceRoot?: string;
};

export async function removeContainer(containerName: string): Promise<void> {
  try {
    await execFileAsync("docker", ["rm", "-f", containerName], {
      maxBuffer: 1024 * 1024,
    });
  } catch {
    // Container may already be gone when using --rm or a prior cleanup.
  }
}

export function formatSandboxOutput(result: SandboxResult): string {
  const header = [
    "[sandbox] isolated docker execution",
    `exit_code=${result.exitCode}`,
    result.timedOut ? "timed_out=true" : "timed_out=false",
  ].join(" ");
  return `${header}\n${result.output}`.trim();
}

export async function runSandboxedCommand(
  command: string,
  options: SandboxRunOptions = {},
): Promise<SandboxResult> {
  const config = readSandboxConfig(options);
  const workspace = resolve(options.workspaceRoot ?? process.cwd());
  const containerName = `token-lab-sandbox-${randomUUID().slice(0, 8)}`;
  const timeoutSec = Math.max(1, Math.ceil(config.timeoutMs / 1000));
  const wrappedCommand = `timeout ${timeoutSec}s sh -lc ${JSON.stringify(command)}`;

  const args = [
    "run",
    "--name",
    containerName,
    "--cpus",
    config.cpus,
    "--memory",
    config.memory,
    "--memory-swap",
    config.memory,
    "--pids-limit",
    "256",
    "--network",
    config.network,
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid",
    "--mount",
    `type=bind,src=${workspace},dst=/workspace,readonly`,
    "-w",
    "/workspace",
    config.image,
    "sh",
    "-lc",
    wrappedCommand,
  ];

  try {
    const { stdout, stderr } = await execFileAsync("docker", args, {
      maxBuffer: 4 * 1024 * 1024,
      timeout: config.timeoutMs + 15_000,
    });

    return {
      exitCode: 0,
      output: [stdout, stderr].filter(Boolean).join("\n") || "(no output)",
      timedOut: false,
      containerName,
    };
  } catch (error) {
    const err = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number | string;
      killed?: boolean;
    };

    const output = [err.stdout, err.stderr]
      .filter(Boolean)
      .map((chunk) => String(chunk))
      .join("\n");
    const timedOut =
      Boolean(err.killed) ||
      err.code === 124 ||
      /timed out|timeout/i.test(output);

    return {
      exitCode: typeof err.code === "number" ? err.code : 1,
      output: output || String(error),
      timedOut,
      containerName,
    };
  } finally {
    await removeContainer(containerName);
  }
}

export async function runSandboxedTests(
  command = "npm test",
  options: SandboxRunOptions = {},
): Promise<string> {
  const result = await runSandboxedCommand(command, options);
  if (result.timedOut) {
    return `${formatSandboxOutput(result)}\nSandbox test run timed out.`;
  }
  if (result.exitCode !== 0) {
    return `${formatSandboxOutput(result)}\nSandbox test run failed.`;
  }
  return formatSandboxOutput(result);
}
