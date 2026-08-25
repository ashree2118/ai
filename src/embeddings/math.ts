export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
  return sum;
}

export function magnitude(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const denom = magnitude(a) * magnitude(b);
  if (denom === 0) return 0;
  return dot(a, b) / denom;
}

export function topKSimilar<T extends { vector: number[] }>(
  query: number[],
  items: T[],
  k: number,
): Array<T & { score: number }> {
  return items
    .map((item) => ({
      ...item,
      score: cosineSimilarity(query, item.vector),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

function center(vectors: number[][]): number[][] {
  const dim = vectors[0]?.length ?? 0;
  const mean = new Array<number>(dim).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dim; i++) mean[i]! += vector[i]!;
  }
  for (let i = 0; i < dim; i++) mean[i]! /= vectors.length;

  return vectors.map((vector) =>
    vector.map((value, index) => value - mean[index]!),
  );
}

function gramMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const value = dot(vectors[i]!, vectors[j]!);
      matrix[i]![j] = value;
      matrix[j]![i] = value;
    }
  }

  return matrix;
}

function topEigenvector(matrix: number[][]): number[] {
  const n = matrix.length;
  let vector = Array.from({ length: n }, () => Math.random());

  for (let step = 0; step < 60; step++) {
    const next = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) next[i]! += matrix[i]![j]! * vector[j]!;
    }
    const norm = magnitude(next) || 1;
    vector = next.map((value) => value / norm);
  }

  return vector;
}

function deflate(
  matrix: number[][],
  eigenvector: number[],
  eigenvalue: number,
): number[][] {
  return matrix.map((row, i) =>
    row.map(
      (value, j) => value - eigenvalue * eigenvector[i]! * eigenvector[j]!,
    ),
  );
}

function largestEigenvalue(matrix: number[][], vector: number[]): number {
  const projected = matrix.map((row) => dot(row, vector));
  return dot(vector, projected);
}

export function pca2D(vectors: number[][]): Array<[number, number]> {
  const centered = center(vectors);
  let matrix = gramMatrix(centered);

  const v1 = topEigenvector(matrix);
  const lambda1 = Math.max(largestEigenvalue(matrix, v1), 0);
  matrix = deflate(matrix, v1, lambda1);
  const v2 = topEigenvector(matrix);
  const lambda2 = Math.max(largestEigenvalue(matrix, v2), 0);

  const component1 = v1.map((value) => value * Math.sqrt(lambda1));
  const component2 = v2.map((value) => value * Math.sqrt(lambda2));

  return component1.map((x, index) => [x, component2[index]!]);
}
