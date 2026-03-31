/**
 * Error context — Vite-compatible replacement for the Next.js ErrorProvider.
 * Provides a setError(error, message) function used by API mutation hooks.
 */

import React, { createContext, useContext, useState, useCallback } from "react";

interface ErrorState {
  error: Error | null;
  message: string | null;
}

interface ErrorContextValue {
  errorState: ErrorState;
  setError: (error: Error, message?: string) => void;
  clearError: () => void;
}

const ErrorContext = createContext<ErrorContextValue | undefined>(undefined);

export function ErrorProvider({ children }: { children: React.ReactNode }) {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    message: null,
  });

  const setError = useCallback((error: Error, message?: string) => {
    console.error(message || "An error occurred:", error);
    setErrorState({ error, message: message || error.message });

    // Auto-dismiss after 8 seconds
    setTimeout(() => {
      setErrorState((prev) =>
        prev.error === error ? { error: null, message: null } : prev,
      );
    }, 8000);
  }, []);

  const clearError = useCallback(() => {
    setErrorState({ error: null, message: null });
  }, []);

  return React.createElement(
    ErrorContext.Provider,
    { value: { errorState, setError, clearError } },
    children,
    // Render error toast if there's an active error
    errorState.message
      ? React.createElement(
          "div",
          {
            className:
              "fixed bottom-6 right-6 z-[9999] max-w-md bg-red-50 border border-red-200 text-red-800 px-5 py-4 rounded-md shadow-lg animate-in slide-in-from-bottom-4 flex items-start gap-3",
            role: "alert",
          },
          React.createElement(
            "div",
            { className: "flex-1" },
            React.createElement(
              "p",
              { className: "text-sm font-semibold" },
              "Error",
            ),
            React.createElement(
              "p",
              { className: "text-sm mt-0.5 text-red-700" },
              errorState.message,
            ),
          ),
          React.createElement(
            "button",
            {
              onClick: clearError,
              className:
                "text-red-400 hover:text-red-600 text-lg leading-none mt-0.5",
              "aria-label": "Dismiss error",
            },
            "×",
          ),
        )
      : null,
  );
}

export function useError() {
  const context = useContext(ErrorContext);
  if (context === undefined) {
    throw new Error("useError must be used within an ErrorProvider");
  }
  return context;
}
