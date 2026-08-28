import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exitCodeForAgentResult, printAgentResult } from "../agent-output.js";
import { buildUserTask, createContextBuilder } from "../context/gather.js";
import { recordEpisodeFromRun } from "../memory/record-episode.js";
import { indexEvalCorpus } from "../eval/runner.js";
import { ReactAgent } from "../react-agent.js";
import { ChunkVectorStore } from "../rag/store.js";
import { AgentTrace } from "../trace/agent-trace.js";
import { analyzeTrace } from "./analyze.js";
import { E2E_REAL_ISSUE } from "./real-issue.js";

export type RunE2EOptions = {
  issue?: typeof E2E_REAL_ISSUE;
  ragTopK?: number;
  maxIterations?: number;
  maxTokenBudget?: number;
  outputDir?: string;
  skipIndex?: boolean;
};

export async function runE2EIssue(options: RunE2EOptions = {}) {
  const issue = options.issue ?? E2E_REAL_ISSUE;
  const outputDir = resolve(options.outputDir ?? "traces");
  const trace = new AgentTrace(issue.id);

  if (process.env.DATABASE_URL && !options.skipIndex) {
    const store = ChunkVectorStore.connect();
    try {
      await store.migrate();
      const indexed = await indexEvalCorpus(store);
      console.error(`[e2e] indexed ${indexed} chunks for RAG`);
    } finally {
      await store.close();
    }
  }

  const contextBuilder = await createContextBuilder({
    task: issue.task,
    issueText: `# ${issue.title}\n\n${issue.issueBody}`,
    ragTopK: options.ragTopK ?? 5,
  });

  const agent = new ReactAgent({
    dynamicSystem: (messages) => contextBuilder.buildSystem(messages),
    maxIterations: options.maxIterations ?? 8,
    maxTokenBudget: options.maxTokenBudget ?? 20_000,
    trace,
    enableScratchpad: true,
    log: (message) => console.error(message),
  });

  console.error(`[e2e] running issue ${issue.id}: ${issue.title}`);
  const result = await agent.run(buildUserTask(issue.task));

  const episodeId = await recordEpisodeFromRun({
    task: issue.task,
    issueText: `# ${issue.title}\n\n${issue.issueBody}`,
    result,
    scratchpad: agent.scratchpadState,
  });
  if (episodeId) {
    console.error(`[e2e] recorded episode ${episodeId}`);
  }

  const record = trace.toRecord(result);
  const traceReport = trace.formatReport();
  const analysis = analyzeTrace(issue, record);

  await mkdir(outputDir, { recursive: true });
  const base = resolve(outputDir, issue.id);
  await writeFile(`${base}.trace.md`, traceReport, "utf8");
  await writeFile(`${base}.analysis.md`, analysis, "utf8");
  await writeFile(`${base}.json`, JSON.stringify(record, null, 2), "utf8");

  console.error(`[e2e] wrote ${base}.trace.md`);
  console.error(`[e2e] wrote ${base}.analysis.md`);

  return { result, record, traceReport, analysis, exitCode: exitCodeForAgentResult(result) };
}
