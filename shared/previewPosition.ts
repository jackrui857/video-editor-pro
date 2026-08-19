export type PreviewBounds = { left: number; top: number; width: number; height: number };

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value * 100) / 100));

export function getPreviewPosition(clientX: number, clientY: number, bounds: PreviewBounds) {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 50, y: 50 };
  return {
    x: clamp(((clientX - bounds.left) / bounds.width) * 100),
    y: clamp(((clientY - bounds.top) / bounds.height) * 100),
  };
}
