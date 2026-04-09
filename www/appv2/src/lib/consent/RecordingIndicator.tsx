/**
 * RecordingIndicator — visual indicator that a meeting is being recorded.
 */

export function RecordingIndicator() {
  return (
    <div className="flex items-center gap-1.5 text-red-500 text-xs font-medium">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
      </span>
      Recording
    </div>
  );
}
