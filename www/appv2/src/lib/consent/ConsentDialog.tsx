/**
 * ConsentDialog — ported from Next.js, restyled with Tailwind.
 */

import { useState, useEffect, useRef } from "react";
import { CONSENT_DIALOG_TEXT } from "./constants";

interface ConsentDialogProps {
  onAccept: () => void;
  onReject: () => void;
}

export function ConsentDialog({ onAccept, onReject }: ConsentDialogProps) {
  const acceptButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Auto-focus accept button so Escape key works
    acceptButtonRef.current?.focus();
  }, []);

  return (
    <div className="p-6 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg max-w-md mx-auto">
      <div className="flex flex-col items-center gap-4">
        <p className="text-base text-center font-medium text-on-surface">
          {CONSENT_DIALOG_TEXT.question}
        </p>
        <div className="flex items-center gap-4 justify-center">
          <button
            onClick={onReject}
            className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-mid rounded-sm transition-colors"
          >
            {CONSENT_DIALOG_TEXT.rejectButton}
          </button>
          <button
            ref={acceptButtonRef}
            onClick={onAccept}
            className="px-4 py-2 text-sm font-semibold text-white bg-gradient-primary rounded-sm hover:brightness-110 active:brightness-95 transition-all"
          >
            {CONSENT_DIALOG_TEXT.acceptButton}
          </button>
        </div>
      </div>
    </div>
  );
}
