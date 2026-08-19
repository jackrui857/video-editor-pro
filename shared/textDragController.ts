import { getPreviewPosition, type PreviewBounds } from "./previewPosition";

export type PointerTargetLike = {
  setPointerCapture: (pointerId: number) => void;
  hasPointerCapture: (pointerId: number) => boolean;
  releasePointerCapture: (pointerId: number) => void;
};

export type TextDragPointerEvent = {
  pointerId: number;
  clientX: number;
  clientY: number;
  currentTarget: PointerTargetLike;
  preventDefault: () => void;
  stopPropagation?: () => void;
};

type TextDragControllerOptions = {
  getBounds: () => PreviewBounds | undefined;
  selectText: (id: string) => void;
  setDraggingText: (id: string | null) => void;
  updatePosition: (id: string, position: { x: number; y: number }) => void;
};

export function createTextDragController(options: TextDragControllerOptions) {
  let activeTextId: string | null = null;

  const updateFromPointer = (id: string, event: TextDragPointerEvent) => {
    const bounds = options.getBounds();
    if (!bounds) return;
    options.updatePosition(id, getPreviewPosition(event.clientX, event.clientY, bounds));
  };

  return {
    begin(event: TextDragPointerEvent, id: string) {
      event.preventDefault();
      event.stopPropagation?.();
      event.currentTarget.setPointerCapture(event.pointerId);
      activeTextId = id;
      options.selectText(id);
      options.setDraggingText(id);
      updateFromPointer(id, event);
    },
    move(event: TextDragPointerEvent, id: string) {
      if (activeTextId !== id) return false;
      event.preventDefault();
      updateFromPointer(id, event);
      return true;
    },
    end(event: TextDragPointerEvent, id: string) {
      if (activeTextId !== id) return false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      activeTextId = null;
      options.setDraggingText(null);
      return true;
    },
  };
}
