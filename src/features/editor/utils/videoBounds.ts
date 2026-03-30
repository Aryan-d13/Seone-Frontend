import type { BoundsSpec, CanvasSpec } from '../types/template';

export interface NumericRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampDimension(value: number, max: number): number {
  return Math.min(Math.max(10, Math.round(value)), Math.max(10, Math.round(max)));
}

export function readBoundsAspectRatio(
  bounds:
    | Pick<BoundsSpec, 'width' | 'height'>
    | Pick<NumericRect, 'width' | 'height'>
    | null
    | undefined
): number | null {
  if (!bounds) return null;
  const width = toFiniteNumber(bounds.width, 0);
  const height = toFiniteNumber(bounds.height, 0);
  if (width <= 0 || height <= 0) return null;
  return width / height;
}

export function clampVideoRectPosition(
  rect: NumericRect,
  canvas: Pick<CanvasSpec, 'width' | 'height'>
): NumericRect {
  const width = clampDimension(toFiniteNumber(rect.width, canvas.width), canvas.width);
  const height = clampDimension(
    toFiniteNumber(rect.height, canvas.height),
    canvas.height
  );

  return {
    x: clamp(Math.round(toFiniteNumber(rect.x, 0)), 0, Math.max(canvas.width - width, 0)),
    y: clamp(
      Math.round(toFiniteNumber(rect.y, 0)),
      0,
      Math.max(canvas.height - height, 0)
    ),
    width,
    height,
  };
}

export function normalizeVideoRect(
  rect: NumericRect,
  canvas: Pick<CanvasSpec, 'width' | 'height'>,
  _aspectRatio?: number | null
): NumericRect {
  const x = clamp(
    Math.round(toFiniteNumber(rect.x, 0)),
    0,
    Math.max(canvas.width - 10, 0)
  );
  const y = clamp(
    Math.round(toFiniteNumber(rect.y, 0)),
    0,
    Math.max(canvas.height - 10, 0)
  );
  const maxWidth = Math.max(canvas.width - x, 10);
  const maxHeight = Math.max(canvas.height - y, 10);
  const width = clampDimension(toFiniteNumber(rect.width, maxWidth), maxWidth);
  const height = clampDimension(toFiniteNumber(rect.height, maxHeight), maxHeight);

  return {
    x,
    y,
    width,
    height,
  };
}

export function normalizeVideoBounds(
  bounds: BoundsSpec,
  canvas: Pick<CanvasSpec, 'width' | 'height'>,
  aspectRatio?: number | null
): BoundsSpec {
  const normalized = normalizeVideoRect(
    {
      x: toFiniteNumber(bounds.x, 0),
      y: toFiniteNumber(bounds.y, 0),
      width: toFiniteNumber(bounds.width, canvas.width),
      height: toFiniteNumber(bounds.height, canvas.height),
    },
    canvas,
    aspectRatio
  );

  return {
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
  };
}

export function clampVideoBoundsPosition(
  bounds: BoundsSpec,
  canvas: Pick<CanvasSpec, 'width' | 'height'>
): BoundsSpec {
  const normalized = clampVideoRectPosition(
    {
      x: toFiniteNumber(bounds.x, 0),
      y: toFiniteNumber(bounds.y, 0),
      width: toFiniteNumber(bounds.width, canvas.width),
      height: toFiniteNumber(bounds.height, canvas.height),
    },
    canvas
  );

  return {
    x: normalized.x,
    y: normalized.y,
    width: normalized.width,
    height: normalized.height,
  };
}
