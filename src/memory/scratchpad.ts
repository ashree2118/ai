import type {
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";

export type ScratchpadState = {
  goal: string;
  plan: string[];
  hypothesis: string;
  inspectedFiles: string[];
  changedFiles: string[];
  discoveries: string[];
  testResults: string[];
  reflectionNotes: string[];
  nextAction: string;
};

function asRecord(input: unknown): Record<string, unknown> | null {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return null;
}

function pathFromInput(input: unknown): string | undefined {
  const record = asRecord(input);
  const path = record?.path;
  return typeof path === "string" && path.length > 0 ? path : undefined;
}

function summarize(text: string, max = 180): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

function isTestCommand(command: string): boolean {
  return /\b(npm test|node --test|vitest|jest|pytest)\b/i.test(command);
}

export class ScratchpadMemory {
  private state: ScratchpadState = {
    goal: "",
    plan: [],
    hypothesis: "",
    inspectedFiles: [],
    changedFiles: [],
    discoveries: [],
    testResults: [],
    reflectionNotes: [],
    nextAction: "Inspect relevant files and gather evidence.",
  };

  get snapshot(): ScratchpadState {
    return {
      goal: this.state.goal,
      plan: [...this.state.plan],
      hypothesis: this.state.hypothesis,
      inspectedFiles: [...this.state.inspectedFiles],
      changedFiles: [...this.state.changedFiles],
      discoveries: [...this.state.discoveries],
      testResults: [...this.state.testResults],
      reflectionNotes: [...this.state.reflectionNotes],
      nextAction: this.state.nextAction,
    };
  }

  setGoal(goal: string): void {
    this.state.goal = goal.trim();
    if (this.state.plan.length === 0) {
      this.state.plan = [
        "Identify relevant files",
        "Inspect implementation details",
        "Synthesize findings into a final answer",
      ];
    }
    this.state.hypothesis =
      "The answer should be grounded in repository files related to the goal.";
  }

  recordToolBatch(
    toolUses: ToolUseBlock[],
    results: ToolResultBlockParam[],
  ): void {
    for (const toolUse of toolUses) {
      const result = results.find(
        (item) => item.tool_use_id === toolUse.id,
      );
      const output =
        typeof result?.content === "string"
          ? result.content
          : JSON.stringify(result?.content ?? "");
      const isError = Boolean(result?.is_error);

      this.recordTool(toolUse.name, toolUse.input, output, isError);
    }

    this.refreshDerivedFields();
  }

  recordReflection(notes: string[]): void {
    this.state.reflectionNotes = [...notes];
    if (notes.length > 0) {
      this.state.nextAction =
        "Analyze recent failures, update your hypothesis, and try a different approach.";
    }
  }

  private recordTool(
    name: string,
    input: unknown,
    output: string,
    isError: boolean,
  ): void {
    const path = pathFromInput(input);
    const command =
      typeof asRecord(input)?.command === "string"
        ? String(asRecord(input)?.command)
        : undefined;

    if (name === "read_file" || name === "github_read_file") {
      if (path) this.addUnique(this.state.inspectedFiles, path);
      this.addPlanStep(`Inspect ${path ?? "file"}`);
      if (!isError) {
        this.addDiscovery(`Read ${path ?? "file"}: ${summarize(output)}`);
      }
    }

    if (name === "list_files" || name === "github_list_files") {
      const location = path ?? ".";
      this.addPlanStep(`List files at ${location}`);
      if (!isError) {
        this.addDiscovery(`Listed ${location}: ${summarize(output)}`);
      }
    }

    if (name === "github_write_file" && path) {
      this.addUnique(this.state.changedFiles, path);
      this.addPlanStep(`Update ${path}`);
      this.addDiscovery(`Changed ${path} on branch`);
    }

    if (name === "run_command" && command) {
      this.addPlanStep(`Run command: ${summarize(command, 80)}`);
      if (isTestCommand(command)) {
        this.state.testResults.push(summarize(output, 240));
      } else if (!isError) {
        this.addDiscovery(`Command output: ${summarize(output)}`);
      }
    }

    if (name === "github_get_issue" && !isError) {
      this.addDiscovery(`Issue details: ${summarize(output)}`);
    }

    if (isError) {
      this.addDiscovery(`${name} failed: ${summarize(output)}`);
    }
  }

  private refreshDerivedFields(): void {
    if (this.state.inspectedFiles.length > 0) {
      this.state.hypothesis = `Key implementation details are likely in ${this.state.inspectedFiles.join(", ")}.`;
    }

    if (this.state.changedFiles.length > 0) {
      this.state.nextAction = "Verify changes with tests and summarize the diff.";
      return;
    }

    if (this.state.testResults.length > 0) {
      this.state.nextAction = "Interpret test results and provide the final answer.";
      return;
    }

    if (this.state.inspectedFiles.length > 0) {
      this.state.nextAction =
        "Synthesize inspected files and provide the final answer.";
      return;
    }

    this.state.nextAction = "Inspect the most relevant files for this goal.";
  }

  private addPlanStep(step: string): void {
    if (!this.state.plan.includes(step)) {
      this.state.plan.push(step);
    }
  }

  private addDiscovery(entry: string): void {
    if (!this.state.discoveries.includes(entry)) {
      this.state.discoveries.push(entry);
    }
  }

  private addUnique(items: string[], value: string): void {
    if (!items.includes(value)) items.push(value);
  }

  format(): string {
    const lines = [
      "## Scratchpad",
      "",
      "### Goal",
      this.state.goal || "(not set)",
      "",
      "### Plan",
      ...(this.state.plan.length
        ? this.state.plan.map((step) => `- ${step}`)
        : ["- (empty)"]),
      "",
      "### Hypothesis",
      this.state.hypothesis || "(not set)",
      "",
      "### Inspected Files",
      ...(this.state.inspectedFiles.length
        ? this.state.inspectedFiles.map((file) => `- ${file}`)
        : ["- (none)"]),
      "",
      "### Changed Files",
      ...(this.state.changedFiles.length
        ? this.state.changedFiles.map((file) => `- ${file}`)
        : ["- (none)"]),
      "",
      "### Discoveries",
      ...(this.state.discoveries.length
        ? this.state.discoveries.map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "### Test Results",
      ...(this.state.testResults.length
        ? this.state.testResults.map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "### Reflection",
      ...(this.state.reflectionNotes.length
        ? this.state.reflectionNotes.map((item) => `- ${item}`)
        : ["- (none)"]),
      "",
      "### Next Action",
      this.state.nextAction || "(not set)",
    ];

    return lines.join("\n");
  }
}
