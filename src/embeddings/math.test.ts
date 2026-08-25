import assert from "node:assert/strict";
import test from "node:test";
import { cosineSimilarity, pca2D, topKSimilar } from "./math.js";

test("cosineSimilarity returns 1 for identical vectors", () => {
  const vector = [1, 2, 3];
  assert.equal(cosineSimilarity(vector, vector), 1);
});

test("topKSimilar returns highest scores first", () => {
  const items = [
    { id: "a", vector: [1, 0, 0] },
    { id: "b", vector: [0.9, 0.1, 0] },
    { id: "c", vector: [0, 1, 0] },
  ];

  const top = topKSimilar([1, 0, 0], items, 2);
  assert.deepEqual(
    top.map((item) => item.id),
    ["a", "b"],
  );
  assert.ok(top[0]!.score >= top[1]!.score);
});

test("pca2D returns one coordinate pair per vector", () => {
  const vectors = [
    [1, 0, 0],
    [0.9, 0.1, 0],
    [0, 1, 0],
    [0, 0.9, 0.1],
  ];
  const coords = pca2D(vectors);
  assert.equal(coords.length, vectors.length);
  for (const point of coords) {
    assert.equal(point.length, 2);
  }
});
