import { components } from "../reflector-api";
import { NonEmptyString, parseMaybeNonEmptyString } from "./utils";

type ApiTranscriptStatus =
  components["schemas"]["GetTranscriptWithParticipants"]["status"];

export type TranscriptStatus = ApiTranscriptStatus;

type SourceKind = components["schemas"]["SourceKind"];

export type TranscriptSource = {
  // what to display: room name, room id, or the source kind
  label: string;
  // set only when the room page can be linked to
  roomName: NonEmptyString | null;
};

/**
 * Describe where a transcript comes from: a named room, or its source kind
 * for live/file transcripts (which have no room).
 */
export const transcriptSource = (transcript: {
  source_kind: SourceKind;
  room_name?: string | null;
  room_id?: string | null;
}): TranscriptSource => {
  if (transcript.source_kind !== "room") {
    return { label: transcript.source_kind, roomName: null };
  }
  const roomName = parseMaybeNonEmptyString(transcript.room_name || "");
  if (roomName) return { label: roomName, roomName };
  const roomId = parseMaybeNonEmptyString(transcript.room_id || "");
  return { label: roomId || transcript.source_kind, roomName: null };
};
