import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";
import {
  createSafeApiFetch,
  isRetryableApiError,
  shouldRetryApiRequest,
} from "./lib/safeApiResponse";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryApiRequest,
      retryDelay: attemptIndex => Math.min(800 * 2 ** attemptIndex, 2_500),
    },
    // 影片渲染、上傳等 mutation 可能有副作用，保持由使用者手動重送。
    mutations: { retry: false },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

const notifyServiceUnavailable = (error: unknown) => {
  if (!isRetryableApiError(error)) return;
  toast.error("服務暫時不可用", {
    description: "系統會自動重試查詢；若是輸出或辨識動作，請稍候後再次按下原本的按鈕。",
    duration: 7_000,
  });
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    notifyServiceUnavailable(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    notifyServiceUnavailable(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return createSafeApiFetch((requestInput, requestInit) =>
          globalThis.fetch(requestInput, {
            ...(requestInit ?? {}),
            credentials: "include",
          }),
        )(input, init);
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
