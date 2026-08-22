import { exec } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";

const execAsync = promisify(exec);

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export type ListFilesInput = {
  path: string;
  include_hidden?: boolean;
  sort?: "name" | "type";
};

export type ReadFileInput = {
  path: string;
  encoding?: "utf8";
  max_bytes?: number;
};

export type RunCommandInput = {
  command: string;
  shell?: "posix" | "powershell";
  timeout_ms?: number;
};

export const TOOLS: Tool[] = [
  {
    name: "list_files",
    description:
      "List files and directories at a workspace-relative path. Returns one entry per line.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description:
            "Workspace-relative directory path. Use '.' for the workspace root.",
          minLength: 1,
        },
        include_hidden: {
          type: "boolean",
          description:
            "When true, include dotfiles and dot-directories. Defaults to false.",
        },
        sort: {
          type: "string",
          enum: ["name", "type"],
          description:
            "Sort entries by name (default) or by type (directories first).",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description:
      "Read a workspace-relative text file and return its UTF-8 contents.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative file path.",
          minLength: 1,
        },
        encoding: {
          type: "string",
          enum: ["utf8"],
          description: "Text encoding. Only utf8 is supported.",
        },
        max_bytes: {
          type: "integer",
          description:
            "Maximum bytes to read. Must be between 1 and 1048576 (1 MiB).",
          minimum: 1,
          maximum: 1_048_576,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "run_command",
    description:
      "Run a shell command inside the workspace directory and return combined stdout/stderr.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute.",
          minLength: 1,
        },
        shell: {
          type: "string",
          enum: ["posix", "powershell"],
          description:
            "Shell flavor. Defaults to powershell on Windows and posix elsewhere.",
        },
        timeout_ms: {
          type: "integer",
          description: "Command timeout in milliseconds (1000-60000).",
          minimum: 1000,
          maximum: 60_000,
        },
      },
      required: ["command"],
    },
  },
];

function workspaceRoot(): string {
  return resolve(process.cwd());
}

function safePath(path: string): string {
  const root = workspaceRoot();
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new ToolInputError(`path escapes workspace: ${path}`);
  }
  return target;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoExtraKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw new ToolInputError(`unexpected field: ${key}`);
    }
  }
}

function assertString(
  input: Record<string, unknown>,
  field: string,
  minLength = 1,
): string {
  const value = input[field];
  if (typeof value !== "string") {
    throw new ToolInputError(`${field} must be a string`);
  }
  if (value.length < minLength) {
    throw new ToolInputError(`${field} must be at least ${minLength} character(s)`);
  }
  return value;
}

function assertOptionalBoolean(
  input: Record<string, unknown>,
  field: string,
): boolean | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ToolInputError(`${field} must be a boolean`);
  }
  return value;
}

function assertOptionalEnum<T extends string>(
  input: Record<string, unknown>,
  field: string,
  values: readonly T[],
): T | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new ToolInputError(`${field} must be one of: ${values.join(", ")}`);
  }
  return value as T;
}

function assertOptionalInteger(
  input: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): number | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ToolInputError(`${field} must be an integer`);
  }
  if (value < min || value > max) {
    throw new ToolInputError(`${field} must be between ${min} and ${max}`);
  }
  return value;
}

export function validateListFilesInput(input: unknown): ListFilesInput {
  if (!isRecord(input)) throw new ToolInputError("input must be an object");
  assertNoExtraKeys(input, ["path", "include_hidden", "sort"]);

  const validated: ListFilesInput = {
    path: assertString(input, "path"),
  };
  const includeHidden = assertOptionalBoolean(input, "include_hidden");
  const sort = assertOptionalEnum(input, "sort", ["name", "type"]);
  if (includeHidden !== undefined) validated.include_hidden = includeHidden;
  if (sort !== undefined) validated.sort = sort;
  return validated;
}

export function validateReadFileInput(input: unknown): ReadFileInput {
  if (!isRecord(input)) throw new ToolInputError("input must be an object");
  assertNoExtraKeys(input, ["path", "encoding", "max_bytes"]);

  const validated: ReadFileInput = {
    path: assertString(input, "path"),
  };
  const encoding = assertOptionalEnum(input, "encoding", ["utf8"]);
  const maxBytes = assertOptionalInteger(input, "max_bytes", 1, 1_048_576);
  if (encoding !== undefined) validated.encoding = encoding;
  if (maxBytes !== undefined) validated.max_bytes = maxBytes;
  return validated;
}

export function validateRunCommandInput(input: unknown): RunCommandInput {
  if (!isRecord(input)) throw new ToolInputError("input must be an object");
  assertNoExtraKeys(input, ["command", "shell", "timeout_ms"]);

  const validated: RunCommandInput = {
    command: assertString(input, "command"),
  };
  const shell = assertOptionalEnum(input, "shell", ["posix", "powershell"]);
  const timeoutMs = assertOptionalInteger(input, "timeout_ms", 1000, 60_000);
  if (shell !== undefined) validated.shell = shell;
  if (timeoutMs !== undefined) validated.timeout_ms = timeoutMs;
  return validated;
}

export function validateToolInput(name: string, input: unknown): void {
  switch (name) {
    case "list_files":
      validateListFilesInput(input);
      return;
    case "read_file":
      validateReadFileInput(input);
      return;
    case "run_command":
      validateRunCommandInput(input);
      return;
    default:
      throw new ToolInputError(`unknown tool: ${name}`);
  }
}

function defaultShell(): "posix" | "powershell" {
  return process.platform === "win32" ? "powershell" : "posix";
}

function shellCommand(command: string, shell: "posix" | "powershell"): string {
  if (shell === "powershell") {
    return `powershell -NoProfile -Command ${JSON.stringify(command)}`;
  }
  return command;
}

async function listFiles(input: ListFilesInput): Promise<string> {
  const dir = safePath(input.path);
  const includeHidden = input.include_hidden ?? false;
  const entries = await readdir(dir, { withFileTypes: true });

  const visible = includeHidden
    ? entries
    : entries.filter((entry) => !entry.name.startsWith("."));

  const sorted = [...visible].sort((a, b) => {
    if (input.sort === "type") {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
    }
    return a.name.localeCompare(b.name);
  });

  return sorted
    .map((entry) => `${entry.isDirectory() ? "[dir]" : "[file]"} ${entry.name}`)
    .join("\n");
}

async function readFileTool(input: ReadFileInput): Promise<string> {
  const file = safePath(input.path);
  const info = await stat(file);
  if (!info.isFile()) {
    throw new ToolInputError(`not a file: ${input.path}`);
  }

  const maxBytes = input.max_bytes ?? 1_048_576;
  if (info.size > maxBytes) {
    throw new ToolInputError(
      `file exceeds max_bytes (${info.size} > ${maxBytes})`,
    );
  }

  return readFile(file, input.encoding ?? "utf8");
}

async function runCommand(input: RunCommandInput): Promise<string> {
  const shell = input.shell ?? defaultShell();
  const timeout = input.timeout_ms ?? 30_000;
  const command =
    shell === "powershell"
      ? shellCommand(input.command, shell)
      : input.command;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workspaceRoot(),
      maxBuffer: 1024 * 1024,
      timeout,
    });
    return [stdout, stderr].filter(Boolean).join("\n") || "(no output)";
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    const parts = [error.stdout, error.stderr, error.message].filter(Boolean);
    return parts.join("\n");
  }
}

export async function runTool(name: string, input: unknown): Promise<string> {
  validateToolInput(name, input);

  switch (name) {
    case "list_files":
      return listFiles(validateListFilesInput(input));
    case "read_file":
      return readFileTool(validateReadFileInput(input));
    case "run_command":
      return runCommand(validateRunCommandInput(input));
    default:
      throw new ToolInputError(`unknown tool: ${name}`);
  }
}
