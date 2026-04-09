/**
 * ConsentDialogButton — floating "Meeting is being recorded" button.
 * Restyled from Chakra to Tailwind.
 */

import { CONSENT_DIALOG_TEXT, CONSENT_BUTTON_TOP_OFFSET, CONSENT_BUTTON_LEFT_OFFSET, CONSENT_BUTTON_Z_INDEX } from "./constants";

interface ConsentDialogButtonProps {
  onClick: () => void;
}

export function ConsentDialogButton({ onClick }: ConsentDialogButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed flex items-center gap-2 px-3 py-2 bg-red-500 text-white text-xs font-semibold rounded-sm shadow-md hover:bg-red-600 active:bg-red-700 transition-colors animate-pulse"
      style={{
        top: CONSENT_BUTTON_TOP_OFFSET,
        left: CONSENT_BUTTON_LEFT_OFFSET,
        zIndex: CONSENT_BUTTON_Z_INDEX,
      }}
    >
      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
      {CONSENT_DIALOG_TEXT.triggerButton}
    </button>
  );
}
