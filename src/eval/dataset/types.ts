export type EvalSplit = "train" | "test";

export type AgentEvalIssue = {
  id: string;
  split: EvalSplit;
  repository: {
    owner: string;
    repo: string;
  };
  title: string;
  issueText: string;
  correctFiles: string[];
  referenceFix: {
    commit: string;
    summary: string;
  };
  approach: string;
};
