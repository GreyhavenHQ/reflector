import type { components } from "../../lib/reflector-api";

type GetTranscriptTopic = components["schemas"]["GetTranscriptTopic"];

export type Topic = GetTranscriptTopic;

export type TranscriptStatus = "idle" | "recording" | "uploaded" | "processing" | "ended" | "error";

export type Transcript = {
  text: string;
};

export type FinalSummary = {
  summary: string;
};

export type Status = {
  value: TranscriptStatus;
};

export type TranslatedTopic = {
  text: string;
  translation: string;
};
