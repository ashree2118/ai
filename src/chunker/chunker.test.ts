import assert from "node:assert/strict";
import test from "node:test";
import { chunkSource } from "./chunker.js";

const SAMPLE = `
export class Greeter {
  constructor(private name: string) {}

  greet(): string {
    return \`hello \${this.name}\`;
  }
}

export function add(a: number, b: number): number {
  return a + b;
}

export interface User {
  id: string;
}

export type UserId = string;

export enum Role {
  Admin = "admin",
  Member = "member",
}

export const multiply = (a: number, b: number) => a * b;
`;

test("chunkSource extracts classes, methods, functions, and declarations", () => {
  const result = chunkSource("sample.ts", SAMPLE);
  const kinds = result.chunks.map((chunk) => chunk.kind);
  const symbols = result.chunks.map((chunk) => chunk.symbol);

  assert.ok(kinds.includes("class"));
  assert.ok(kinds.includes("method"));
  assert.ok(kinds.includes("function"));
  assert.ok(kinds.includes("interface"));
  assert.ok(kinds.includes("type"));
  assert.ok(kinds.includes("enum"));
  assert.ok(kinds.includes("variable"));

  assert.ok(symbols.includes("Greeter"));
  assert.ok(symbols.includes("greet"));
  assert.ok(symbols.includes("constructor"));
  assert.ok(symbols.includes("add"));
});

test("chunkSource preserves metadata", () => {
  const result = chunkSource("sample.ts", SAMPLE);
  const greet = result.chunks.find((chunk) => chunk.symbol === "greet");

  assert.ok(greet);
  assert.equal(greet.filePath, "sample.ts");
  assert.equal(greet.className, "Greeter");
  assert.equal(greet.kind, "method");
  assert.ok(greet.startLine > 0);
  assert.ok(greet.endLine >= greet.startLine);
  assert.match(greet.code, /return `hello/);
});

test("chunkSource handles javascript files", () => {
  const result = chunkSource(
    "sample.js",
    `export function jsAdd(a, b) { return a + b; }`,
  );

  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0]?.kind, "function");
  assert.equal(result.chunks[0]?.symbol, "jsAdd");
});
