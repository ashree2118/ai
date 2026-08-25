const EMBEDDING_MODEL = "text-embedding-3-small";

type EmbeddingResponse = {
  data: Array<{ embedding: number[]; index: number }>;
};

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`embedding request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as EmbeddingResponse;
  return payload.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}
