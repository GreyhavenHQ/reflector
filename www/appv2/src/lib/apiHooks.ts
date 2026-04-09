/**
 * API Hooks — ported from Next.js app/lib/apiHooks.ts
 *
 * ~40 hooks covering Rooms, Transcripts, Meetings, Participants,
 * Topics, Zulip, Config, API Keys, WebRTC, etc.
 *
 * Adaptations from Next.js version:
 * - Removed "use client" directives
 * - Replaced useError from Next.js ErrorProvider with our errorContext
 * - useAuth comes from our AuthProvider (not next-auth)
 */

import { $api } from "./apiClient";
import { useError } from "./errorContext";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import type { components } from "./reflector-api";
import { useAuth } from "./AuthProvider";
import { MeetingId } from "./types";
import { NonEmptyString } from "./utils";

// ─── Transcript status types ─────────────────────────────────────────────────

type TranscriptStatus = "processing" | "uploaded" | "recording" | "processed" | "error";

// ─── Auth readiness ──────────────────────────────────────────────────────────

export const useAuthReady = () => {
  const auth = useAuth();

  return {
    isAuthenticated: auth.status === "authenticated",
    isLoading: auth.status === "loading",
  };
};

// ─── Rooms ───────────────────────────────────────────────────────────────────

export function useRoomsList(page: number = 1) {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/rooms",
    {
      params: {
        query: { page },
      },
    },
    {
      enabled: isAuthenticated,
    },
  );
}

export function useRoomGet(roomId: string | null) {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/rooms/{room_id}",
    {
      params: {
        path: { room_id: roomId! },
      },
    },
    {
      enabled: !!roomId && isAuthenticated,
    },
  );
}

export function useRoomGetByName(roomName: string | null) {
  return $api.useQuery(
    "get",
    "/v1/rooms/name/{room_name}",
    {
      params: {
        path: { room_name: roomName! },
      },
    },
    {
      enabled: !!roomName,
    },
  );
}

export function useRoomCreate() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation("post", "/v1/rooms", {
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: $api.queryOptions("get", "/v1/rooms").queryKey,
      });
    },
    onError: (error) => {
      setError(error as Error, "There was an error creating the room");
    },
  });
}

export function useRoomUpdate() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation("patch", "/v1/rooms/{room_id}", {
    onSuccess: async (room) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: $api.queryOptions("get", "/v1/rooms").queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: $api.queryOptions("get", "/v1/rooms/{room_id}", {
            params: {
              path: {
                room_id: room.id,
              },
            },
          }).queryKey,
        }),
      ]);
    },
    onError: (error) => {
      setError(error as Error, "There was an error updating the room");
    },
  });
}

export function useRoomDelete() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation("delete", "/v1/rooms/{room_id}", {
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: $api.queryOptions("get", "/v1/rooms").queryKey,
      });
    },
    onError: (error) => {
      setError(error as Error, "There was an error deleting the room");
    },
  });
}

export function useRoomTestWebhook() {
  const { setError } = useError();

  return $api.useMutation("post", "/v1/rooms/{room_id}/webhook/test", {
    onError: (error) => {
      setError(error as Error, "There was an error testing the webhook");
    },
  });
}

// ─── Transcripts ─────────────────────────────────────────────────────────────

type SourceKind = components["schemas"]["SourceKind"];

export const TRANSCRIPT_SEARCH_URL = "/v1/transcripts/search" as const;

export const invalidateTranscriptLists = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({
    queryKey: ["get", TRANSCRIPT_SEARCH_URL],
  });

export function useTranscriptsSearch(
  q: string = "",
  options: {
    limit?: number;
    offset?: number;
    room_id?: string;
    source_kind?: SourceKind;
  } = {},
) {
  return $api.useQuery(
    "get",
    TRANSCRIPT_SEARCH_URL,
    {
      params: {
        query: {
          q,
          limit: options.limit,
          offset: options.offset,
          room_id: options.room_id,
          source_kind: options.source_kind,
        },
      },
    },
    {
      enabled: true,
    },
  );
}

export function useTranscriptGet(transcriptId: NonEmptyString | null) {
  const ACTIVE_TRANSCRIPT_STATUSES = new Set<TranscriptStatus>([
    "processing",
    "uploaded",
    "recording",
  ]);

  return $api.useQuery(
    "get",
    "/v1/transcripts/{transcript_id}",
    {
      params: {
        path: {
          transcript_id: transcriptId!,
        },
      },
    },
    {
      enabled: !!transcriptId,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status && ACTIVE_TRANSCRIPT_STATUSES.has(status as TranscriptStatus) ? 5000 : false;
      },
    },
  );
}

export const invalidateTranscript = (
  queryClient: QueryClient,
  transcriptId: NonEmptyString,
) =>
  queryClient.invalidateQueries({
    queryKey: $api.queryOptions("get", "/v1/transcripts/{transcript_id}", {
      params: { path: { transcript_id: transcriptId } },
    }).queryKey,
  });

export function useTranscriptCreate() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation("post", "/v1/transcripts", {
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: ["get", TRANSCRIPT_SEARCH_URL],
      });
    },
    onError: (error) => {
      setError(error as Error, "There was an error creating the transcript");
    },
  });
}

export function useTranscriptDelete() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation("delete", "/v1/transcripts/{transcript_id}", {
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: ["get", TRANSCRIPT_SEARCH_URL],
      });
    },
    onError: (error) => {
      setError(error as Error, "There was an error deleting the transcript");
    },
  });
}

export function useTranscriptUpdate() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation("patch", "/v1/transcripts/{transcript_id}", {
    onSuccess: (_data, variables) => {
      return queryClient.invalidateQueries({
        queryKey: $api.queryOptions("get", "/v1/transcripts/{transcript_id}", {
          params: {
            path: { transcript_id: variables.params.path.transcript_id },
          },
        }).queryKey,
      });
    },
    onError: (error) => {
      setError(error as Error, "There was an error updating the transcript");
    },
  });
}

export function useTranscriptProcess() {
  const { setError } = useError();

  return $api.useMutation("post", "/v1/transcripts/{transcript_id}/process", {
    onError: (error) => {
      setError(error as Error, "There was an error processing the transcript");
    },
  });
}

// ─── Transcript Topics ───────────────────────────────────────────────────────

export function useTranscriptTopics(transcriptId: NonEmptyString | null) {
  return $api.useQuery(
    "get",
    "/v1/transcripts/{transcript_id}/topics",
    {
      params: {
        path: { transcript_id: transcriptId! },
      },
    },
    {
      enabled: !!transcriptId,
    },
  );
}

export const invalidateTranscriptTopics = (
  queryClient: QueryClient,
  transcriptId: NonEmptyString,
) =>
  queryClient.invalidateQueries({
    queryKey: $api.queryOptions(
      "get",
      "/v1/transcripts/{transcript_id}/topics",
      {
        params: { path: { transcript_id: transcriptId } },
      },
    ).queryKey,
  });

export function useTranscriptTopicsWithWords(
  transcriptId: NonEmptyString | null,
) {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/transcripts/{transcript_id}/topics/with-words",
    {
      params: {
        path: { transcript_id: transcriptId! },
      },
    },
    {
      enabled: !!transcriptId && isAuthenticated,
    },
  );
}

export function useTranscriptTopicsWithWordsPerSpeaker(
  transcriptId: NonEmptyString | null,
  topicId: string | null,
) {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/transcripts/{transcript_id}/topics/{topic_id}/words-per-speaker",
    {
      params: {
        path: {
          transcript_id: transcriptId!,
          topic_id: topicId!,
        },
      },
    },
    {
      enabled: !!transcriptId && !!topicId && isAuthenticated,
    },
  );
}

// ─── Transcript Audio ────────────────────────────────────────────────────────

export function useTranscriptWaveform(transcriptId: NonEmptyString | null) {
  return $api.useQuery(
    "get",
    "/v1/transcripts/{transcript_id}/audio/waveform",
    {
      params: {
        path: { transcript_id: transcriptId! },
      },
    },
    {
      enabled: !!transcriptId,
      retry: false,
    },
  );
}

export const invalidateTranscriptWaveform = (
  queryClient: QueryClient,
  transcriptId: NonEmptyString,
) =>
  queryClient.invalidateQueries({
    queryKey: $api.queryOptions(
      "get",
      "/v1/transcripts/{transcript_id}/audio/waveform",
      {
        params: { path: { transcript_id: transcriptId } },
      },
    ).queryKey,
  });

export function useTranscriptMP3(transcriptId: NonEmptyString | null) {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/transcripts/{transcript_id}/audio/mp3",
    {
      params: {
        path: { transcript_id: transcriptId! },
      },
    },
    {
      enabled: !!transcriptId && isAuthenticated,
    },
  );
}

export function useTranscriptUploadAudio() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation(
    "post",
    "/v1/transcripts/{transcript_id}/record/upload",
    {
      onSuccess: (_data, variables) => {
        return queryClient.invalidateQueries({
          queryKey: $api.queryOptions(
            "get",
            "/v1/transcripts/{transcript_id}",
            {
              params: {
                path: { transcript_id: variables.params.path.transcript_id },
              },
            },
          ).queryKey,
        });
      },
      onError: (error) => {
        setError(error as Error, "There was an error uploading the audio file");
      },
    },
  );
}

// ─── Transcript Participants ─────────────────────────────────────────────────

export function useTranscriptParticipants(transcriptId: NonEmptyString | null) {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/transcripts/{transcript_id}/participants",
    {
      params: {
        path: { transcript_id: transcriptId! },
      },
    },
    {
      enabled: !!transcriptId && isAuthenticated,
    },
  );
}

export function useTranscriptParticipantUpdate() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation(
    "patch",
    "/v1/transcripts/{transcript_id}/participants/{participant_id}",
    {
      onSuccess: (_data, variables) => {
        return queryClient.invalidateQueries({
          queryKey: $api.queryOptions(
            "get",
            "/v1/transcripts/{transcript_id}/participants",
            {
              params: {
                path: { transcript_id: variables.params.path.transcript_id },
              },
            },
          ).queryKey,
        });
      },
      onError: (error) => {
        setError(error as Error, "There was an error updating the participant");
      },
    },
  );
}

export function useTranscriptParticipantCreate() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation(
    "post",
    "/v1/transcripts/{transcript_id}/participants",
    {
      onSuccess: (_data, variables) => {
        return queryClient.invalidateQueries({
          queryKey: $api.queryOptions(
            "get",
            "/v1/transcripts/{transcript_id}/participants",
            {
              params: {
                path: { transcript_id: variables.params.path.transcript_id },
              },
            },
          ).queryKey,
        });
      },
      onError: (error) => {
        setError(error as Error, "There was an error creating the participant");
      },
    },
  );
}

export function useTranscriptParticipantDelete() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation(
    "delete",
    "/v1/transcripts/{transcript_id}/participants/{participant_id}",
    {
      onSuccess: (_data, variables) => {
        return queryClient.invalidateQueries({
          queryKey: $api.queryOptions(
            "get",
            "/v1/transcripts/{transcript_id}/participants",
            {
              params: {
                path: { transcript_id: variables.params.path.transcript_id },
              },
            },
          ).queryKey,
        });
      },
      onError: (error) => {
        setError(error as Error, "There was an error deleting the participant");
      },
    },
  );
}

// ─── Transcript Speaker Management ──────────────────────────────────────────

export function useTranscriptSpeakerAssign() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation(
    "patch",
    "/v1/transcripts/{transcript_id}/speaker/assign",
    {
      onSuccess: (_data, variables) => {
        return Promise.all([
          queryClient.invalidateQueries({
            queryKey: $api.queryOptions(
              "get",
              "/v1/transcripts/{transcript_id}",
              {
                params: {
                  path: { transcript_id: variables.params.path.transcript_id },
                },
              },
            ).queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: $api.queryOptions(
              "get",
              "/v1/transcripts/{transcript_id}/participants",
              {
                params: {
                  path: { transcript_id: variables.params.path.transcript_id },
                },
              },
            ).queryKey,
          }),
        ]);
      },
      onError: (error) => {
        setError(error as Error, "There was an error assigning the speaker");
      },
    },
  );
}

export function useTranscriptSpeakerMerge() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation(
    "patch",
    "/v1/transcripts/{transcript_id}/speaker/merge",
    {
      onSuccess: (_data, variables) => {
        return Promise.all([
          queryClient.invalidateQueries({
            queryKey: $api.queryOptions(
              "get",
              "/v1/transcripts/{transcript_id}",
              {
                params: {
                  path: { transcript_id: variables.params.path.transcript_id },
                },
              },
            ).queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: $api.queryOptions(
              "get",
              "/v1/transcripts/{transcript_id}/participants",
              {
                params: {
                  path: { transcript_id: variables.params.path.transcript_id },
                },
              },
            ).queryKey,
          }),
        ]);
      },
      onError: (error) => {
        setError(error as Error, "There was an error merging speakers");
      },
    },
  );
}

// ─── Transcript Sharing ──────────────────────────────────────────────────────

export function useTranscriptPostToZulip() {
  const { setError } = useError();

  // @ts-ignore - Zulip endpoint not in OpenAPI spec
  return $api.useMutation("post", "/v1/transcripts/{transcript_id}/zulip", {
    onError: (error) => {
      setError(error as Error, "There was an error posting to Zulip");
    },
  });
}

export function useTranscriptSendEmail() {
  const { setError } = useError();

  return $api.useMutation("post", "/v1/transcripts/{transcript_id}/email", {
    onError: (error) => {
      setError(error as Error, "There was an error sending the email");
    },
  });
}

// ─── Transcript WebRTC ───────────────────────────────────────────────────────

export function useTranscriptWebRTC() {
  const { setError } = useError();

  return $api.useMutation(
    "post",
    "/v1/transcripts/{transcript_id}/record/webrtc",
    {
      onError: (error) => {
        setError(error as Error, "There was an error with WebRTC connection");
      },
    },
  );
}

// ─── Meetings ────────────────────────────────────────────────────────────────

const MEETINGS_PATH_PARTIAL = "meetings" as const;
const MEETINGS_ACTIVE_PATH_PARTIAL = `${MEETINGS_PATH_PARTIAL}/active` as const;
const MEETINGS_UPCOMING_PATH_PARTIAL =
  `${MEETINGS_PATH_PARTIAL}/upcoming` as const;
const MEETING_LIST_PATH_PARTIALS = [
  MEETINGS_ACTIVE_PATH_PARTIAL,
  MEETINGS_UPCOMING_PATH_PARTIAL,
];

export function useRoomsCreateMeeting() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation("post", "/v1/rooms/{room_name}/meeting", {
    onSuccess: async (_data, variables) => {
      const roomName = variables.params.path.room_name;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: $api.queryOptions("get", "/v1/rooms").queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: $api.queryOptions(
            "get",
            "/v1/rooms/{room_name}/meetings/active" as `/v1/rooms/{room_name}/${typeof MEETINGS_ACTIVE_PATH_PARTIAL}`,
            {
              params: {
                path: { room_name: roomName },
              },
            },
          ).queryKey,
        }),
      ]);
    },
    onError: (error) => {
      setError(error as Error, "There was an error creating the meeting");
    },
  });
}

export function useRoomActiveMeetings(roomName: string | null) {
  return $api.useQuery(
    "get",
    "/v1/rooms/{room_name}/meetings/active" as `/v1/rooms/{room_name}/${typeof MEETINGS_ACTIVE_PATH_PARTIAL}`,
    {
      params: {
        path: { room_name: roomName! },
      },
    },
    {
      enabled: !!roomName,
    },
  );
}

export function useRoomUpcomingMeetings(roomName: string | null) {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/rooms/{room_name}/meetings/upcoming" as `/v1/rooms/{room_name}/${typeof MEETINGS_UPCOMING_PATH_PARTIAL}`,
    {
      params: {
        path: { room_name: roomName! },
      },
    },
    {
      enabled: !!roomName && isAuthenticated,
    },
  );
}

export function useRoomGetMeeting(
  roomName: string | null,
  meetingId: MeetingId | null,
) {
  return $api.useQuery(
    "get",
    "/v1/rooms/{room_name}/meetings/{meeting_id}",
    {
      params: {
        path: {
          room_name: roomName!,
          meeting_id: meetingId!,
        },
      },
    },
    {
      enabled: !!roomName && !!meetingId,
    },
  );
}

export function useRoomJoinMeeting() {
  const { setError } = useError();

  return $api.useMutation(
    "post",
    "/v1/rooms/{room_name}/meetings/{meeting_id}/join",
    {
      onError: (error) => {
        setError(error as Error, "There was an error joining the meeting");
      },
    },
  );
}

export function useMeetingStartRecording() {
  const { setError } = useError();

  return $api.useMutation(
    "post",
    "/v1/meetings/{meeting_id}/recordings/start",
    {
      onError: (error) => {
        setError(error as Error, "Failed to start recording");
      },
    },
  );
}

export function useMeetingAudioConsent() {
  const { setError } = useError();

  return $api.useMutation("post", "/v1/meetings/{meeting_id}/consent", {
    onError: (error) => {
      setError(error as Error, "There was an error recording consent");
    },
  });
}

export function useMeetingAddEmailRecipient() {
  const { setError } = useError();

  return $api.useMutation("post", "/v1/meetings/{meeting_id}/email-recipient", {
    onError: (error) => {
      setError(error as Error, "There was an error adding the email");
    },
  });
}

export function useMeetingDeactivate() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation("patch", `/v1/meetings/{meeting_id}/deactivate`, {
    onError: (error) => {
      setError(error as Error, "Failed to end meeting");
    },
    onSuccess: () => {
      return queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return key.some(
            (k) =>
              typeof k === "string" &&
              !!MEETING_LIST_PATH_PARTIALS.find((e) => k.includes(e)),
          );
        },
      });
    },
  });
}

// ─── API Keys ──────────────────────────────────────────────────────────────────

export function useApiKeysList() {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/user/api-keys",
    {},
    {
      enabled: isAuthenticated,
    },
  );
}

export function useApiKeyCreate() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation("post", "/v1/user/api-keys", {
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: $api.queryOptions("get", "/v1/user/api-keys").queryKey,
      });
    },
    onError: (error) => {
      setError(error as Error, "There was an error creating the API key");
    },
  });
}

export function useApiKeyRevoke() {
  const { setError } = useError();
  const queryClient = useQueryClient();

  return $api.useMutation("delete", "/v1/user/api-keys/{key_id}", {
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: $api.queryOptions("get", "/v1/user/api-keys").queryKey,
      });
    },
    onError: (error) => {
      setError(error as Error, "There was an error rewoking the API key");
    },
  });
}

// ─── Config ──────────────────────────────────────────────────────────────────

export function useConfig() {
  return $api.useQuery("get", "/v1/config", {});
}

// ─── Zulip ───────────────────────────────────────────────────────────────────

export function useZulipStreams(enabled: boolean = true) {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/zulip/streams",
    {},
    {
      enabled: enabled && isAuthenticated,
    },
  );
}

export function useZulipTopics(streamId: number | null) {
  const { isAuthenticated } = useAuthReady();
  const enabled = !!streamId && isAuthenticated;
  return $api.useQuery(
    "get",
    "/v1/zulip/streams/{stream_id}/topics",
    {
      params: {
        path: {
          stream_id: enabled ? streamId : 0,
        },
      },
    },
    {
      enabled,
    },
  );
}

// ─── Calendar / ICS ──────────────────────────────────────────────────────────

export function useRoomIcsSync() {
  const { setError } = useError();

  return $api.useMutation("post", "/v1/rooms/{room_name}/ics/sync", {
    onError: (error) => {
      setError(error as Error, "There was an error syncing the calendar");
    },
  });
}

export function useRoomIcsStatus(roomName: string | null) {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/rooms/{room_name}/ics/status",
    {
      params: {
        path: { room_name: roomName! },
      },
    },
    {
      enabled: !!roomName && isAuthenticated,
    },
  );
}

export function useRoomCalendarEvents(roomName: string | null) {
  const { isAuthenticated } = useAuthReady();

  return $api.useQuery(
    "get",
    "/v1/rooms/{room_name}/meetings",
    {
      params: {
        path: { room_name: roomName! },
      },
    },
    {
      enabled: !!roomName && isAuthenticated,
    },
  );
}
