import { isNonEmptyArray, NonEmptyArray } from "./array";

export function getErrorDetail(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === "object" && error !== null) {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
    const response = (error as { response?: { data?: { detail?: unknown } } })
      .response;
    const nestedDetail = response?.data?.detail;
    if (typeof nestedDetail === "string" && nestedDetail.length > 0)
      return nestedDetail;
  }
  return fallback;
}

export function formatJoinError(error: unknown): string {
  const detail = getErrorDetail(error, "");
  switch (detail) {
    case "Meeting has ended":
      return "This meeting has ended. The organizer can start a new one.";
    case "Meeting is not active":
      return "This meeting is no longer active. Ask the organizer to start it again.";
    case "Meeting not found":
      return "This meeting no longer exists. Check the link or ask the organizer for a new one.";
    case "Room not found":
      return "This room doesn't exist.";
    default:
      return detail || "We couldn't join the meeting. Please try again.";
  }
}

export function shouldShowError(error: Error | null | undefined) {
  if (
    error?.name == "ResponseError" &&
    (error["response"].status == 404 || error["response"].status == 403)
  )
    return false;
  if (error?.name == "FetchError") return false;
  return true;
}

const defaultMergeErrors = (ex: NonEmptyArray<unknown>): unknown => {
  try {
    return new Error(
      ex
        .map((e) =>
          e ? (e.toString ? e.toString() : JSON.stringify(e)) : `${e}`,
        )
        .join("\n"),
    );
  } catch (e) {
    console.error("Error merging errors:", e);
    return ex[0];
  }
};

type ReturnTypes<T extends readonly (() => any)[]> = {
  [K in keyof T]: T[K] extends () => infer R ? R : never;
};

// sequence semantic for "throws"
// calls functions passed and collects its thrown values
export function sequenceThrows<Fns extends readonly (() => any)[]>(
  ...fs: Fns
): ReturnTypes<Fns> {
  const results: unknown[] = [];
  const errors: unknown[] = [];

  for (const f of fs) {
    try {
      results.push(f());
    } catch (e) {
      errors.push(e);
    }
  }
  if (errors.length) throw defaultMergeErrors(errors as NonEmptyArray<unknown>);
  return results as ReturnTypes<Fns>;
}
