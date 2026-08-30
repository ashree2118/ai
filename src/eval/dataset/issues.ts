import type { AgentEvalIssue } from "./types.js";

export const EVAL_REPOSITORY = {
  owner: "token-lab",
  repo: "token-lab",
} as const;

export const AGENT_EVAL_DATASET: AgentEvalIssue[] = [
  {
    id: "eval-01",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Add token counting CLI for files",
    issueText: `## Problem
We need a quick way to measure prompt size before sending files to Claude.

## Acceptance criteria
- Count characters, words, and input tokens for a file
- Support comparing multiple files in one command
- Use the Anthropic count_tokens API`,
    correctFiles: ["src/index.ts"],
    referenceFix: {
      commit: "c04e1f2",
      summary: "Implement token-lab CLI with count and compare commands.",
    },
    approach:
      "Use @anthropic-ai/sdk messages.countTokens on file contents and print a side-by-side comparison table.",
  },
  {
    id: "eval-02",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Build multi-turn conversation client",
    issueText: `## Problem
Single-shot prompts are not enough for iterative debugging.

## Acceptance criteria
- Store user and assistant messages across turns
- Support a persistent system prompt
- Print per-turn and cumulative token usage`,
    correctFiles: ["src/conversation.ts", "src/chat.ts"],
    referenceFix: {
      commit: "91ad77b",
      summary: "Add Conversation class and chat CLI entry point.",
    },
    approach:
      "Wrap Anthropic messages.create in a Conversation helper that appends MessageParam history between turns.",
  },
  {
    id: "eval-03",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Stream Claude responses over SSE",
    issueText: `## Problem
Long answers block the terminal until the full completion returns.

## Acceptance criteria
- Enable stream: true on the Messages API
- Print text deltas as they arrive
- Detect message_stop and handle stream errors`,
    correctFiles: ["src/stream.ts"],
    referenceFix: {
      commit: "2b8f6de",
      summary: "Add SSE streaming client with delta printing.",
    },
    approach:
      "Iterate response stream events, accumulate text blocks, and stop cleanly on message_stop.",
  },
  {
    id: "eval-04",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Add strict JSON schemas for workspace tools",
    issueText: `## Problem
Workspace tools accept loosely validated inputs.

## Acceptance criteria
- Add precise JSON schemas for list_files, read_file, and run_command
- Enable strict validation with additionalProperties: false
- Reject invalid tool inputs before execution`,
    correctFiles: ["src/tools.ts", "src/validation.ts"],
    referenceFix: {
      commit: "7e2a9c1",
      summary: "Extract validators and attach strict schemas to workspace tools.",
    },
    approach:
      "Centralize validators in validation.ts and call them from runWorkspaceTool before filesystem or shell access.",
  },
  {
    id: "eval-05",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Implement GitHub Octokit toolkit",
    issueText: `## Problem
The agent cannot inspect or modify remote repositories on GitHub.

## Acceptance criteria
- Add github_get_issue, github_list_files, github_read_file
- Add github_create_branch, github_write_file, github_create_pr
- Validate inputs and default owner/repo from env`,
    correctFiles: ["src/github/toolkit.ts", "src/tool-registry.ts"],
    referenceFix: {
      commit: "d13f880",
      summary: "Add GitHub toolkit and register prefixed github_* tools.",
    },
    approach:
      "Use Octokit REST helpers behind strict validators and expose each operation as a separate tool.",
  },
  {
    id: "eval-06",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Chunk TypeScript files by AST symbols",
    issueText: `## Problem
Whole-file retrieval is too coarse for large modules.

## Acceptance criteria
- Split TS/JS files into function, method, class, and declaration chunks
- Preserve file path, symbol, and line metadata
- Expose a chunkFiles helper for indexing`,
    correctFiles: ["src/chunker/chunker.ts", "src/chunker/types.ts"],
    referenceFix: {
      commit: "aa51c44",
      summary: "Add AST chunker using the TypeScript compiler API.",
    },
    approach:
      "Walk the AST, emit CodeChunk records for top-level declarations, and include line ranges for retrieval snippets.",
  },
  {
    id: "eval-07",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Store code chunks in pgvector",
    issueText: `## Problem
We need semantic retrieval over repository code.

## Acceptance criteria
- Migrate Postgres schema with pgvector and HNSW index
- Upsert chunk embeddings
- Implement searchSimilar(query, topK)`,
    correctFiles: ["src/rag/store.ts", "src/rag/schema.ts"],
    referenceFix: {
      commit: "5c0d912",
      summary: "Add ChunkVectorStore with cosine similarity search.",
    },
    approach:
      "Embed chunk text with OpenAI embeddings, store vectors in Postgres, and rank by cosine distance.",
  },
  {
    id: "eval-08",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Extract reusable ReAct agent loop",
    issueText: `## Problem
The tool-use loop is duplicated across CLIs.

## Acceptance criteria
- Extract LLM -> tool_use -> execute -> tool_result loop
- Support dynamic system prompts and guardrails
- Return structured run metadata`,
    correctFiles: ["src/react-agent.ts", "src/tool-loop.ts"],
    referenceFix: {
      commit: "f81b2ad",
      summary: "Add ReactAgent class with configurable tool execution.",
    },
    approach:
      "Keep message history in ReactAgent, call executeTools for tool_use blocks, and continue until end_turn.",
  },
  {
    id: "eval-09",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Inject issue, repo, and RAG context into the agent",
    issueText: `## Problem
The agent starts cold without repository or issue context.

## Acceptance criteria
- Gather GitHub issue, repo tree, and top-k RAG chunks
- Refresh tool history each iteration
- Build a single system prompt from structured sections`,
    correctFiles: ["src/context/gather.ts", "src/context/builder.ts"],
    referenceFix: {
      commit: "3ad44ef",
      summary: "Add ContextBuilder and gatherStaticContext helpers.",
    },
    approach:
      "Preload static context once, then rebuild tool history from message state on every LLM call.",
  },
  {
    id: "eval-10",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Add iteration and token guardrails",
    issueText: `## Problem
Long-running agents can loop forever or burn tokens.

## Acceptance criteria
- Support maxIterations and maxTokenBudget
- Track cumulative token usage
- Return partial results with an explicit reason`,
    correctFiles: ["src/guardrails.ts", "src/agent-output.ts"],
    referenceFix: {
      commit: "18c7e55",
      summary: "Add guardrail helpers and partial result formatting.",
    },
    approach:
      "Accumulate usage after each LLM call and stop the loop when configured limits are exceeded.",
  },
  {
    id: "eval-11",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Trace end-to-end issue runs",
    issueText: `## Problem
We cannot inspect what the agent did on a real issue.

## Acceptance criteria
- Record iterations, tool calls, and outcomes
- Write trace and analysis markdown reports
- Provide heuristics for success and unnecessary tool use`,
    correctFiles: ["src/trace/agent-trace.ts", "src/e2e/analyze.ts", "src/e2e/run.ts"],
    referenceFix: {
      commit: "6e0b331",
      summary: "Add AgentTrace logging and e2e trace analysis.",
    },
    approach:
      "Emit structured trace events from ReactAgent and summarize them after the run completes.",
  },
  {
    id: "eval-12",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Add within-run scratchpad memory",
    issueText: `## Problem
The agent loses structured state across many tool calls.

## Acceptance criteria
- Track goal, plan, inspected files, discoveries, and test results
- Update scratchpad after each tool batch
- Inject formatted scratchpad into the system prompt`,
    correctFiles: ["src/memory/scratchpad.ts", "src/react-agent.ts"],
    referenceFix: {
      commit: "b92d710",
      summary: "Add ScratchpadMemory and inject it into resolveSystem.",
    },
    approach:
      "Derive scratchpad updates heuristically from tool names and outputs, then append the formatted section to the system prompt.",
  },
  {
    id: "eval-13",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Store and retrieve episodic memory in Postgres",
    issueText: `## Problem
Past successful runs are not reused on similar issues.

## Acceptance criteria
- Persist completed runs with issue type, files changed, approach, and result
- Embed episodes with pgvector
- Retrieve similar episodes for new issues`,
    correctFiles: [
      "src/memory/episodes.ts",
      "src/memory/episode-store.ts",
      "src/memory/record-episode.ts",
    ],
    referenceFix: {
      commit: "4f1ac89",
      summary: "Add agent_episodes table and episode retrieval in context gathering.",
    },
    approach:
      "Serialize run outcomes into episode records, embed them, and inject top matches into the system prompt.",
  },
  {
    id: "eval-14",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Compress long agent history with rolling summary",
    issueText: `## Problem
Tool history grows too large for the context window.

## Acceptance criteria
- Keep task, scratchpad, summary, and recent turns
- Summarize dropped turns into a rolling summary
- Trigger compression by char or turn limits`,
    correctFiles: ["src/context/manager.ts", "src/context/tool-history.ts"],
    referenceFix: {
      commit: "0d8c623",
      summary: "Add ContextManager sliding window and summary injection.",
    },
    approach:
      "Group messages into turns, summarize older turns into a rolling block, and pass only recent messages to the API.",
  },
  {
    id: "eval-15",
    split: "train",
    repository: EVAL_REPOSITORY,
    title: "Verify changes before creating pull requests",
    issueText: `## Problem
The agent can open PRs before tests and typecheck pass.

## Acceptance criteria
- Collect modified files and git diff
- Run npm run build and npm test before github_create_pr
- Block PR creation when verification fails`,
    correctFiles: ["src/verification/runner.ts", "src/verification/git.ts", "src/tool-registry.ts"],
    referenceFix: {
      commit: "e77a904",
      summary: "Gate github_create_pr behind runVerification.",
    },
    approach:
      "Run deterministic git, build, and test checks in runVerification and throw before dispatching create_pr.",
  },
  {
    id: "eval-16",
    split: "test",
    repository: EVAL_REPOSITORY,
    title: "Expose GitHub tools through MCP",
    issueText: `## Problem
External hosts need a standard protocol for GitHub tool access.

## Acceptance criteria
- Stand up a stdio MCP server for GitHub tools
- Connect the agent through an MCP client
- Keep direct toolkit behavior as fallback`,
    correctFiles: [
      "src/mcp/github-server.ts",
      "src/mcp/github-client.ts",
      "src/mcp/connect.ts",
    ],
    referenceFix: {
      commit: "1c93f57",
      summary: "Add MCP server/client and optional github tool routing.",
    },
    approach:
      "Register MCP tools that delegate to runTool and enable them with USE_GITHUB_MCP or --github-mcp.",
  },
  {
    id: "eval-17",
    split: "test",
    repository: EVAL_REPOSITORY,
    title: "Require human approval for plan and PR creation",
    issueText: `## Problem
High-risk actions should not run without review.

## Acceptance criteria
- Pause before the first tool batch for plan approval
- Pause before github_create_pr
- Keep low-risk tools autonomous`,
    correctFiles: ["src/hitl/gate.ts", "src/hitl/cli-approver.ts", "src/react-agent.ts"],
    referenceFix: {
      commit: "53be2ac",
      summary: "Add HitlGate checkpoints for plan and PR creation.",
    },
    approach:
      "Prompt on stderr for approval, reject with tool errors when the human declines, and continue the loop otherwise.",
  },
  {
    id: "eval-18",
    split: "test",
    repository: EVAL_REPOSITORY,
    title: "Retry with reflection after tool failures",
    issueText: `## Problem
The agent repeats the same failing tool call blindly.

## Acceptance criteria
- Feed tool errors into scratchpad reflection
- Limit retries for identical tool+input signatures
- Let the LLM choose a different approach`,
    correctFiles: ["src/reflection/retry.ts", "src/memory/scratchpad.ts"],
    referenceFix: {
      commit: "9a6d1ee",
      summary: "Add RetryPolicy and reflection sections after failed tools.",
    },
    approach:
      "Track failure signatures, block identical retries after a small limit, and inject reflection notes into the next system prompt.",
  },
  {
    id: "eval-19",
    split: "test",
    repository: EVAL_REPOSITORY,
    title: "Run repository tests in a Docker sandbox",
    issueText: `## Problem
Test commands execute directly on the host machine.

## Acceptance criteria
- Detect test commands in run_command
- Execute them in an isolated Docker container
- Enforce CPU, memory, timeout, filesystem, and network restrictions
- Always remove the container afterward`,
    correctFiles: ["src/sandbox/executor.ts", "src/sandbox/config.ts", "src/tools.ts"],
    referenceFix: {
      commit: "72c4b08",
      summary: "Route test commands through runSandboxedTests when SANDBOX_TESTS=1.",
    },
    approach:
      "Use docker run with read-only workspace mount, no network, resource limits, and guaranteed cleanup in finally.",
  },
  {
    id: "eval-20",
    split: "test",
    repository: EVAL_REPOSITORY,
    title: "Execute independent tool calls concurrently",
    issueText: `## Problem
Independent reads run sequentially and waste latency.

## Acceptance criteria
- Group tool calls by dependency
- Run independent tools with Promise.allSettled
- Preserve result order for the model`,
    correctFiles: ["src/tool-loop.ts"],
    referenceFix: {
      commit: "26f0a3d",
      summary: "Add dependency grouping and parallel executeTools batches.",
    },
    approach:
      "Scan tool inputs for tool_use_id references, batch independent tools together, and merge results in request order.",
  },
];
