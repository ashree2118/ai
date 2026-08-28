import type { ReactAgentResult } from "../react-agent.js";
import { buildEpisodeFromRun } from "./episodes.js";
import { EpisodeVectorStore } from "./episode-store.js";
import type { ScratchpadState } from "./scratchpad.js";

export async function recordEpisodeFromRun(input: {
  task: string;
  issueText?: string;
  result: ReactAgentResult;
  scratchpad?: ScratchpadState;
  episodeStore?: EpisodeVectorStore;
}): Promise<string | null> {
  if (!process.env.DATABASE_URL && !input.episodeStore) {
    return null;
  }

  const episode = buildEpisodeFromRun(input);
  const store = input.episodeStore ?? EpisodeVectorStore.connect();
  const shouldClose = !input.episodeStore;

  try {
    await store.migrate();
    return await store.saveEpisode(episode);
  } finally {
    if (shouldClose) await store.close();
  }
}
