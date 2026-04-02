"use client";

import { useCallback, useEffect, useState } from "react";
import { Box, Spinner, Center, Text, IconButton } from "@chakra-ui/react";
import { useRouter, useParams } from "next/navigation";
import {
  LiveKitRoom as LKRoom,
  VideoConference,
  RoomAudioRenderer,
  PreJoin,
  type LocalUserChoices,
} from "@livekit/components-react";
import type { components } from "../../reflector-api";
import { useAuth } from "../../lib/AuthProvider";
import { useRoomJoinMeeting } from "../../lib/apiHooks";
import { assertMeetingId } from "../../lib/types";
import {
  ConsentDialogButton,
  RecordingIndicator,
  useConsentDialog,
} from "../../lib/consent";
import { useEmailTranscriptDialog } from "../../lib/emailTranscript";
import { featureEnabled } from "../../lib/features";
import { LuMail } from "react-icons/lu";

type Meeting = components["schemas"]["Meeting"];
type Room = components["schemas"]["RoomDetails"];

interface LiveKitRoomProps {
  meeting: Meeting;
  room: Room;
}

/**
 * Extract LiveKit WebSocket URL, room name, and token from the room_url.
 *
 * The backend returns room_url like: ws://host:7880?room=<name>&token=<jwt>
 * We split these for the LiveKit React SDK.
 */
function parseLiveKitUrl(roomUrl: string): {
  serverUrl: string;
  roomName: string | null;
  token: string | null;
} {
  try {
    const url = new URL(roomUrl);
    const token = url.searchParams.get("token");
    const roomName = url.searchParams.get("room");
    url.searchParams.delete("token");
    url.searchParams.delete("room");
    // Strip trailing slash and leftover ? from URL API
    const serverUrl = url.toString().replace(/[?/]+$/, "");
    return { serverUrl, roomName, token };
  } catch {
    return { serverUrl: roomUrl, roomName: null, token: null };
  }
}

export default function LiveKitRoom({ meeting, room }: LiveKitRoomProps) {
  const router = useRouter();
  const params = useParams();
  const auth = useAuth();
  const authLastUserId = auth.lastUserId;
  const roomName = params?.roomName as string;
  const meetingId = assertMeetingId(meeting.id);

  const joinMutation = useRoomJoinMeeting();
  const [joinedMeeting, setJoinedMeeting] = useState<Meeting | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [userChoices, setUserChoices] = useState<LocalUserChoices | null>(null);

  // ── Consent dialog (same hooks as Daily/Whereby) ──────────
  const { showConsentButton, showRecordingIndicator } = useConsentDialog({
    meetingId,
    recordingType: meeting.recording_type,
    skipConsent: room.skip_consent,
  });

  // ── Email transcript dialog ───────────────────────────────
  const userEmail =
    auth.status === "authenticated" || auth.status === "refreshing"
      ? auth.user.email
      : null;
  const { showEmailModal } = useEmailTranscriptDialog({
    meetingId,
    userEmail,
  });
  const showEmailFeature = featureEnabled("emailTranscript");

  // ── PreJoin defaults ──────────────────────────────────────
  const defaultUsername =
    auth.status === "authenticated" || auth.status === "refreshing"
      ? auth.user.email?.split("@")[0] || auth.user.id?.slice(0, 12) || ""
      : "";

  // ── Join meeting via backend API after PreJoin submit ─────
  useEffect(() => {
    if (
      authLastUserId === undefined ||
      !userChoices ||
      !meeting?.id ||
      !roomName
    )
      return;
    let cancelled = false;

    async function join() {
      try {
        const result = await joinMutation.mutateAsync({
          params: {
            path: { room_name: roomName, meeting_id: meeting.id },
            query: { display_name: userChoices!.username || undefined },
          },
        });
        if (!cancelled) setJoinedMeeting(result);
      } catch (err) {
        console.error("Failed to join LiveKit meeting:", err);
        if (!cancelled) setConnectionError(true);
      }
    }

    join();
    return () => {
      cancelled = true;
    };
  }, [meeting?.id, roomName, authLastUserId, userChoices]);

  const handleDisconnected = useCallback(() => {
    router.push("/browse");
  }, [router]);

  const handlePreJoinSubmit = useCallback((choices: LocalUserChoices) => {
    setUserChoices(choices);
  }, []);

  // ── PreJoin screen (name + device selection) ──────────────
  if (!userChoices) {
    return (
      <Box
        w="100vw"
        h="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="gray.900"
        data-lk-theme="default"
      >
        <PreJoin
          defaults={{
            username: defaultUsername,
            audioEnabled: true,
            videoEnabled: true,
          }}
          onSubmit={handlePreJoinSubmit}
          userLabel="Display Name"
        />
      </Box>
    );
  }

  // ── Loading / error states ────────────────────────────────
  if (connectionError) {
    return (
      <Center h="100vh" bg="gray.50">
        <Text fontSize="lg">Failed to connect to meeting</Text>
      </Center>
    );
  }

  if (!joinedMeeting) {
    return (
      <Center h="100vh" bg="gray.50">
        <Spinner color="blue.500" size="xl" />
      </Center>
    );
  }

  const {
    serverUrl,
    roomName: lkRoomName,
    token,
  } = parseLiveKitUrl(joinedMeeting.room_url);

  if (
    serverUrl &&
    !serverUrl.startsWith("ws://") &&
    !serverUrl.startsWith("wss://")
  ) {
    console.warn(
      `LiveKit serverUrl has unexpected scheme: ${serverUrl}. Expected ws:// or wss://`,
    );
  }

  if (!token || !lkRoomName) {
    return (
      <Center h="100vh" bg="gray.50">
        <Text fontSize="lg">
          {!token
            ? "No access token received from server"
            : "No room name received from server"}
        </Text>
      </Center>
    );
  }

  // ── Render ────────────────────────────────────────────────
  // The token already encodes the room name (in VideoGrants.room),
  // so LiveKit SDK joins the correct room from the token alone.
  return (
    <Box w="100vw" h="100vh" bg="black" position="relative">
      <LKRoom
        serverUrl={serverUrl}
        token={token}
        connect={true}
        audio={userChoices.audioEnabled}
        video={userChoices.videoEnabled}
        onDisconnected={handleDisconnected}
        data-lk-theme="default"
        style={{ height: "100%" }}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LKRoom>

      {/* ── Floating overlay buttons (consent, email, extensible) ── */}
      {showConsentButton && (
        <ConsentDialogButton
          meetingId={meetingId}
          recordingType={meeting.recording_type}
          skipConsent={room.skip_consent}
        />
      )}

      {showRecordingIndicator && <RecordingIndicator />}

      {showEmailFeature && (
        <IconButton
          aria-label="Email transcript"
          position="absolute"
          top="56px"
          right="8px"
          zIndex={1000}
          colorPalette="blue"
          size="sm"
          onClick={showEmailModal}
          variant="solid"
          borderRadius="full"
        >
          <LuMail />
        </IconButton>
      )}
    </Box>
  );
}
