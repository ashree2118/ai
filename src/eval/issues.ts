export type EvalIssue = {
  id: string;
  title: string;
  query: string;
  relevantFiles: string[];
};

export const EVAL_ISSUES: EvalIssue[] = [
  {
    id: "issue-01",
    title: "Parallel tool_use execution with Promise.allSettled",
    query:
      "Execute multiple tool_use blocks concurrently with Promise.allSettled while keeping dependent tool calls sequential.",
    relevantFiles: ["src/tool-loop.ts"],
  },
  {
    id: "issue-02",
    title: "Strict JSON schemas for workspace tools",
    query:
      "Add precise JSON schemas with strict validation for list_files, read_file, and run_command tools.",
    relevantFiles: ["src/tools.ts", "src/validation.ts"],
  },
  {
    id: "issue-03",
    title: "GitHub Octokit toolkit",
    query:
      "Build GitHub tools for get_issue, list_files, read_file, create_branch, write_file, and create_pr using Octokit.",
    relevantFiles: ["src/github/toolkit.ts"],
  },
  {
    id: "issue-04",
    title: "AST code chunker for TypeScript",
    query:
      "Split TypeScript and JavaScript files into chunks by functions, methods, classes, and declarations with line metadata.",
    relevantFiles: ["src/chunker/chunker.ts", "src/chunker/types.ts"],
  },
  {
    id: "issue-05",
    title: "pgvector RAG store for code chunks",
    query:
      "Store code chunk embeddings in PostgreSQL with pgvector and HNSW cosine similarity search.",
    relevantFiles: ["src/rag/store.ts", "src/rag/schema.ts"],
  },
  {
    id: "issue-06",
    title: "SSE streaming for Claude responses",
    query:
      "Stream Claude Messages API responses over SSE, print text deltas, and detect message_stop completion.",
    relevantFiles: ["src/stream.ts"],
  },
  {
    id: "issue-07",
    title: "Multi-turn Conversation client",
    query:
      "Build a Conversation class that stores user and assistant messages, supports a system prompt, and prints token usage.",
    relevantFiles: ["src/conversation.ts", "src/chat.ts"],
  },
  {
    id: "issue-08",
    title: "Compare system prompts side by side",
    query:
      "Run the same coding task against multiple system prompts and compare outputs including a prompt injection test.",
    relevantFiles: ["src/prompt-compare.ts"],
  },
  {
    id: "issue-09",
    title: "Token counting CLI for files",
    query:
      "Count characters, words, and Claude input tokens for text files using the Anthropic count_tokens API.",
    relevantFiles: ["src/index.ts"],
  },
  {
    id: "issue-10",
    title: "Embedding similarity experiment",
    query:
      "Embed code snippets, rank by cosine similarity to a query, and visualize embeddings in 2D.",
    relevantFiles: ["src/embedding-lab.ts", "src/embeddings/math.ts"],
  },
];

export const EVAL_CORPUS_FILES = [
  "src/agent.ts",
  "src/chat.ts",
  "src/chunk-lab.ts",
  "src/chunker/chunker.ts",
  "src/chunker/types.ts",
  "src/conversation.ts",
  "src/embedding-lab.ts",
  "src/embeddings/client.ts",
  "src/embeddings/math.ts",
  "src/embeddings/snippets.ts",
  "src/embeddings/visualize.ts",
  "src/github/toolkit.ts",
  "src/index.ts",
  "src/prompt-compare.ts",
  "src/rag-cli.ts",
  "src/rag/schema.ts",
  "src/rag/store.ts",
  "src/stream.ts",
  "src/tool-loop.ts",
  "src/tool-registry.ts",
  "src/tools.ts",
  "src/validation.ts",
];
