export type RetryableEditorAction = "captions" | "render";

export type RetryHandlers = Record<RetryableEditorAction, () => Promise<void>>;

export function getRetryButtonLabel(action: RetryableEditorAction | null): string | null {
  if (action === "captions") return "重試辨識";
  if (action === "render") return "重新輸出";
  return null;
}

export async function invokeRetryAction(
  action: RetryableEditorAction | null,
  handlers: RetryHandlers,
): Promise<boolean> {
  if (!action) return false;
  await handlers[action]();
  return true;
}
