export type Point = {
  id: string;
  label: string;
  x: number;
  y: number;
  isQuery?: boolean;
};

function scale(value: number, min: number, max: number, size: number, pad: number): number {
  if (max === min) return size / 2;
  return pad + ((value - min) / (max - min)) * (size - pad * 2);
}

export function renderSvg(points: Point[], width = 900, height = 600): string {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 40;

  const circles = points
    .map((point) => {
      const cx = scale(point.x, minX, maxX, width, pad);
      const cy = scale(point.y, minY, maxY, height, pad);
      const fill = point.isQuery ? "#e11d48" : "#2563eb";
      const radius = point.isQuery ? 7 : 5;
      return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius}" fill="${fill}" />\n<text x="${(cx + 8).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="11" fill="#111827">${point.label}</text>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f8fafc" />
  <text x="20" y="24" font-size="16" fill="#0f172a">Embedding PCA (2D)</text>
  <text x="20" y="42" font-size="12" fill="#475569">blue = snippets, red = query</text>
  ${circles}
</svg>`;
}
