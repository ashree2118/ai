export type ChunkKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "variable";

export type CodeChunk = {
  id: string;
  filePath: string;
  symbol: string;
  className?: string;
  kind: ChunkKind;
  startLine: number;
  endLine: number;
  code: string;
};

export type ChunkFileResult = {
  filePath: string;
  chunks: CodeChunk[];
};
