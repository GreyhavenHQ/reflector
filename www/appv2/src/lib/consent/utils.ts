import type { components } from "../reflector-api";

type RecordingType = components["schemas"]["Meeting"]["recording_type"];

export const recordingTypeRequiresConsent = (
  recordingType: RecordingType,
): boolean => {
  const rt = recordingType as string;
  return rt === "cloud" || rt === "raw-tracks";
};
