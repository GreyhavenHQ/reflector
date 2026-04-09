/**
 * WherebyWebinarEmbed — ported from Next.js, restyled with Tailwind.
 *
 * Renders the Whereby embed web component for webinar rooms.
 */

import { useEffect, useRef, useState } from "react";
import "@whereby.com/browser-sdk/embed";

interface WherebyWebinarEmbedProps {
  roomUrl: string;
  onLeave?: () => void;
}

export default function WherebyWebinarEmbed({
  roomUrl,
  onLeave,
}: WherebyWebinarEmbedProps) {
  const wherebyRef = useRef<HTMLElement>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(
    () => !!localStorage.getItem("recording-notice-dismissed"),
  );

  // Recording notice toast
  useEffect(() => {
    if (!roomUrl || noticeDismissed) return;

    // We'll show notice until dismissed
    return () => {};
  }, [roomUrl, noticeDismissed]);

  const handleDismissNotice = () => {
    localStorage.setItem("recording-notice-dismissed", "true");
    setNoticeDismissed(true);
  };

  const handleLeave = () => {
    if (onLeave) {
      onLeave();
    }
  };

  useEffect(() => {
    wherebyRef.current?.addEventListener("leave", handleLeave);

    return () => {
      wherebyRef.current?.removeEventListener("leave", handleLeave);
    };
  }, [handleLeave]);

  return (
    <div className="relative w-screen h-screen">
      {/* Recording Notice Banner */}
      {roomUrl && !noticeDismissed && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-white/95 backdrop-blur-sm px-5 py-3 rounded-md shadow-lg border border-outline-variant/20 flex items-center gap-4 max-w-md">
          <p className="text-sm text-on-surface flex-1">
            This webinar is being recorded. By continuing, you agree to our{" "}
            <a
              href="https://monadical.com/privacy"
              className="text-primary underline underline-offset-2"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
          </p>
          <button
            onClick={handleDismissNotice}
            className="text-muted hover:text-on-surface text-lg leading-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* @ts-ignore — whereby-embed is a web component */}
      <whereby-embed
        ref={wherebyRef}
        room={roomUrl}
        style={{ width: "100vw", height: "100vh" }}
      />
    </div>
  );
}
