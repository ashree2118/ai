import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import ts from "typescript";
import type { ChunkKind, CodeChunk, ChunkFileResult } from "./types.js";

function scriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function getSymbolName(name: ts.PropertyName | ts.BindingName | undefined): string {
  if (!name) return "<anonymous>";
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isPrivateIdentifier(name)) return `#${name.text}`;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) {
    return name.expression.text;
  }
  return "<computed>";
}

function lineRange(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): { startLine: number; endLine: number } {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return { startLine: start.line + 1, endLine: end.line + 1 };
}

function sliceCode(node: ts.Node, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile).trimEnd();
}

function makeChunk(
  filePath: string,
  symbol: string,
  kind: ChunkKind,
  node: ts.Node,
  sourceFile: ts.SourceFile,
  className?: string,
): CodeChunk {
  const { startLine, endLine } = lineRange(node, sourceFile);
  const classSuffix = className ? `:${className}` : "";
  return {
    id: `${filePath}#${kind}:${symbol}${classSuffix}@${startLine}`,
    filePath,
    symbol,
    className,
    kind,
    startLine,
    endLine,
    code: sliceCode(node, sourceFile),
  };
}

function isTopLevel(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    parent !== undefined &&
    (ts.isSourceFile(parent) || ts.isModuleBlock(parent))
  );
}

function collectChunks(sourceFile: ts.SourceFile, filePath: string): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  const visit = (node: ts.Node, className?: string) => {
    if (ts.isClassDeclaration(node) && isTopLevel(node)) {
      const symbol = node.name?.text ?? "<anonymous-class>";
      chunks.push(makeChunk(filePath, symbol, "class", node, sourceFile));
    }

    if (ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
      const parent = node.parent;
      if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) {
        const owner = parent.name?.text ?? className ?? "<anonymous-class>";
        const symbol = ts.isConstructorDeclaration(node)
          ? "constructor"
          : getSymbolName(node.name);
        chunks.push(
          makeChunk(filePath, symbol, "method", node, sourceFile, owner),
        );
      }
    }

    if (ts.isFunctionDeclaration(node) && isTopLevel(node)) {
      const symbol = node.name?.text ?? "<anonymous>";
      chunks.push(makeChunk(filePath, symbol, "function", node, sourceFile));
    }

    if (ts.isVariableStatement(node) && isTopLevel(node)) {
      for (const declaration of node.declarationList.declarations) {
        const symbol = getSymbolName(declaration.name);
        const hasInitializer = declaration.initializer !== undefined;
        const initializerIsFunction =
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer));

        if (!hasInitializer && !initializerIsFunction) continue;

        chunks.push(
          makeChunk(filePath, symbol, "variable", declaration, sourceFile),
        );
      }
    }

    if (ts.isInterfaceDeclaration(node) && isTopLevel(node)) {
      chunks.push(
        makeChunk(
          filePath,
          node.name.text,
          "interface",
          node,
          sourceFile,
        ),
      );
    }

    if (ts.isTypeAliasDeclaration(node) && isTopLevel(node)) {
      chunks.push(
        makeChunk(filePath, node.name.text, "type", node, sourceFile),
      );
    }

    if (ts.isEnumDeclaration(node) && isTopLevel(node)) {
      chunks.push(
        makeChunk(filePath, node.name.text, "enum", node, sourceFile),
      );
    }

    if (ts.isExportAssignment(node) && isTopLevel(node)) {
      chunks.push(
        makeChunk(filePath, "default", "variable", node, sourceFile),
      );
    }

    ts.forEachChild(node, (child) => {
      const nextClassName = ts.isClassDeclaration(node)
        ? node.name?.text ?? className
        : className;
      visit(child, nextClassName);
    });
  };

  visit(sourceFile);
  chunks.sort((a, b) => a.startLine - b.startLine || a.symbol.localeCompare(b.symbol));
  return chunks;
}

export function chunkSource(
  filePath: string,
  sourceText: string,
): ChunkFileResult {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath),
  );

  return {
    filePath,
    chunks: collectChunks(sourceFile, filePath),
  };
}

export async function chunkFile(absolutePath: string): Promise<ChunkFileResult> {
  const sourceText = await readFile(absolutePath, "utf8");
  const filePath = relative(process.cwd(), absolutePath).replace(/\\/g, "/");
  return chunkSource(filePath, sourceText);
}

export async function chunkFiles(paths: string[]): Promise<ChunkFileResult[]> {
  const results: ChunkFileResult[] = [];
  for (const inputPath of paths) {
    const absolutePath = resolve(inputPath);
    results.push(await chunkFile(absolutePath));
  }
  return results;
}

export function summarizeChunks(results: ChunkFileResult[]): string {
  const lines: string[] = [];
  let total = 0;

  for (const result of results) {
    lines.push(`${result.filePath} (${result.chunks.length} chunks)`);
    for (const chunk of result.chunks) {
      total += 1;
      const owner = chunk.className ? ` in ${chunk.className}` : "";
      lines.push(
        `  [${chunk.kind}] ${chunk.symbol}${owner}  L${chunk.startLine}-${chunk.endLine}`,
      );
    }
    lines.push("");
  }

  lines.push(`total chunks: ${total}`);
  return lines.join("\n");
}

export function inspectChunk(chunk: CodeChunk): string {
  const header = [
    `id:        ${chunk.id}`,
    `file:      ${chunk.filePath}`,
    `symbol:    ${chunk.symbol}`,
    chunk.className ? `class:     ${chunk.className}` : null,
    `kind:      ${chunk.kind}`,
    `lines:     ${chunk.startLine}-${chunk.endLine}`,
    "code:",
  ]
    .filter(Boolean)
    .join("\n");

  return `${header}\n${chunk.code}`;
}
