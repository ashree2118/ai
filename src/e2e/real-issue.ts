import type { E2ERealIssue } from "./analyze.js";

export const E2E_REAL_ISSUE: E2ERealIssue = {
  id: "e2e-issue-02",
  title: "Add strict JSON schemas to workspace tools",
  issueBody: `## Problem
Workspace tools accept loosely validated inputs. Invalid enums, missing fields, and extra properties are not consistently rejected before execution.

## Acceptance criteria
- Add precise JSON schemas for list_files, read_file, and run_command
- Enable strict tool validation
- Reject invalid tool inputs with clear errors
- Add tests for valid and invalid inputs

## Likely files
- src/tools.ts
- src/validation.ts`,
  task: "Analyze this repository and explain exactly where strict JSON schemas and validation for list_files, read_file, and run_command live. Name the files, key functions, and what still looks missing relative to the acceptance criteria.",
  expectedFiles: ["src/tools.ts", "src/validation.ts"],
};
