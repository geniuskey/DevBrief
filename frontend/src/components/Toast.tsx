import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import Icon from "./Icon";

interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
}
interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );
  const push = useCallback(
    (tone: Toast["tone"], message: string) => {
      const id = ++seq;
      setToasts((all) =>
        [
          ...all.filter((t) => t.message !== message),
          { id, tone, message },
        ].slice(-4),
      );
      window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4000);
    },
    [dismiss],
  );
  const value = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.tone}`}
            role={t.tone === "error" ? "alert" : "status"}
          >
            <Icon
              name={
                t.tone === "success"
                  ? "check"
                  : t.tone === "error"
                    ? "alert"
                    : "info"
              }
              size={16}
            />
            <span>{t.message}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="알림 닫기"
              onClick={() => dismiss(t.id)}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}
