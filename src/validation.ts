export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertNoExtraKeys(
  input: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw new ToolInputError(`unexpected field: ${key}`);
    }
  }
}

export function assertString(
  input: Record<string, unknown>,
  field: string,
  minLength = 1,
): string {
  const value = input[field];
  if (typeof value !== "string") {
    throw new ToolInputError(`${field} must be a string`);
  }
  if (value.length < minLength) {
    throw new ToolInputError(
      `${field} must be at least ${minLength} character(s)`,
    );
  }
  return value;
}

export function assertOptionalString(
  input: Record<string, unknown>,
  field: string,
  minLength = 1,
): string | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  return assertString(input, field, minLength);
}

export function assertInteger(
  input: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): number {
  const value = input[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ToolInputError(`${field} must be an integer`);
  }
  if (value < min || value > max) {
    throw new ToolInputError(`${field} must be between ${min} and ${max}`);
  }
  return value;
}

export function assertOptionalBoolean(
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

export function assertOptionalEnum<T extends string>(
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

export function assertOptionalInteger(
  input: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): number | undefined {
  const value = input[field];
  if (value === undefined) return undefined;
  return assertInteger(input, field, min, max);
}
