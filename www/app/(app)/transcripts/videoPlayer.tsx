import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Flex, Skeleton, Text } from "@chakra-ui/react";
import { LuMinus, LuPlus, LuVideo, LuX } from "react-icons/lu";
import { useAuth } from "../../lib/AuthProvider";
import { API_URL } from "../../lib/apiClient";
import { generateHighContrastColor } from "../../lib/utils";

type SpeakerInfo = { speaker: number | null; name: string };

type VideoPlayerProps = {
  transcriptId: string;
  duration: number | null;
  expanded: boolean;
  onClose: () => void;
  sourceLanguage?: string | null;
  participants?: SpeakerInfo[] | null;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const VTT_TIMESTAMP_RE =
  /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/g;

function parseVttTimestamp(ts: string): number {
  const [h, m, rest] = ts.split(":");
  const [s, ms] = rest.split(".");
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

function formatVttTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function shiftVttTimestamps(vttContent: string, offsetSeconds: number): string {
  if (offsetSeconds === 0) return vttContent;
  return vttContent.replace(
    VTT_TIMESTAMP_RE,
    (_match, start: string, end: string) => {
      const newStart = formatVttTimestamp(
        parseVttTimestamp(start) + offsetSeconds,
      );
      const newEnd = formatVttTimestamp(parseVttTimestamp(end) + offsetSeconds);
      return `${newStart} --> ${newEnd}`;
    },
  );
}

type VttSegment = { start: number; end: number; speaker: string };

const VTT_CUE_RE =
  /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\n<v ([^>]+)>/g;

function parseVttSegments(vttContent: string): VttSegment[] {
  const segments: VttSegment[] = [];
  let match;
  while ((match = VTT_CUE_RE.exec(vttContent)) !== null) {
    segments.push({
      start: parseVttTimestamp(match[1]),
      end: parseVttTimestamp(match[2]),
      speaker: match[3],
    });
  }
  return segments;
}

// Same background as TopicSegment so speaker colors match the transcript UI
const SPEAKER_COLOR_BG: [number, number, number] = [96, 165, 250];

function SpeakerProgressBar({
  segments,
  videoDuration,
  currentTime,
  captionOffset,
  onSeek,
  participants,
}: {
  segments: VttSegment[];
  videoDuration: number;
  currentTime: number;
  captionOffset: number;
  onSeek: (time: number) => void;
  participants?: SpeakerInfo[] | null;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  // Build a name→"Speaker N" reverse lookup so colors match TopicSegment
  const speakerColors = useMemo(() => {
    const nameToColorKey: Record<string, string> = {};
    if (participants) {
      for (const p of participants) {
        if (p.speaker != null) {
          nameToColorKey[p.name] = `Speaker ${p.speaker}`;
        }
      }
    }
    const map: Record<string, string | undefined> = {};
    for (const seg of segments) {
      if (!map[seg.speaker]) {
        const colorKey = nameToColorKey[seg.speaker] ?? seg.speaker;
        map[seg.speaker] = generateHighContrastColor(
          colorKey,
          SPEAKER_COLOR_BG,
        );
      }
    }
    return map;
  }, [segments, participants]);

  const activeSpeaker = useMemo(() => {
    for (const seg of segments) {
      const adjStart = seg.start + captionOffset;
      const adjEnd = seg.end + captionOffset;
      if (currentTime >= adjStart && currentTime < adjEnd) {
        return seg.speaker;
      }
    }
    return null;
  }, [segments, currentTime, captionOffset]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current || !videoDuration) return;
    const rect = barRef.current.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    onSeek(fraction * videoDuration);
  };

  const progressPct =
    videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;

  return (
    <Box position="relative" mb={4}>
      <Box
        ref={barRef}
        position="relative"
        h="8px"
        bg="gray.700"
        cursor="pointer"
        onClick={handleClick}
        borderBottomRadius="md"
        overflow="hidden"
      >
        {segments.map((seg, i) => {
          const adjStart = Math.max(0, seg.start + captionOffset);
          const adjEnd = Math.max(0, seg.end + captionOffset);
          if (adjEnd <= 0 || adjStart >= videoDuration) return null;
          const leftPct = (adjStart / videoDuration) * 100;
          const widthPct = ((adjEnd - adjStart) / videoDuration) * 100;
          return (
            <Box
              key={i}
              position="absolute"
              top={0}
              bottom={0}
              left={`${leftPct}%`}
              width={`${widthPct}%`}
              bg={speakerColors[seg.speaker]}
            />
          );
        })}
        {/* Playhead */}
        <Box
          position="absolute"
          top={0}
          bottom={0}
          left={`${progressPct}%`}
          w="2px"
          bg="white"
          zIndex={1}
          pointerEvents="none"
        />
      </Box>
      {/* Speaker tooltip below the bar */}
      {activeSpeaker && (
        <Text
          position="absolute"
          top="10px"
          left={`${progressPct}%`}
          transform="translateX(-50%)"
          fontSize="2xs"
          color={speakerColors[activeSpeaker]}
          fontWeight="semibold"
          whiteSpace="nowrap"
          pointerEvents="none"
        >
          {activeSpeaker}
        </Text>
      )}
    </Box>
  );
}

export default function VideoPlayer({
  transcriptId,
  duration,
  expanded,
  onClose,
  sourceLanguage,
  participants,
}: VideoPlayerProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [rawVtt, setRawVtt] = useState<string | null>(null);
  const [captionsUrl, setCaptionsUrl] = useState<string | null>(null);
  const [captionOffset, setCaptionOffset] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevBlobUrl = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const auth = useAuth();
  const accessToken = auth.status === "authenticated" ? auth.accessToken : null;

  useEffect(() => {
    if (!expanded || !transcriptId || videoUrl) return;

    const fetchVideoUrl = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `${API_URL}/v1/transcripts/${transcriptId}/video/url`;
        const headers: Record<string, string> = {};
        if (accessToken) {
          headers["Authorization"] = `Bearer ${accessToken}`;
        }
        const resp = await fetch(url, { headers });
        if (!resp.ok) {
          if (resp.status === 401) {
            throw new Error("Sign in to view the video recording");
          }
          throw new Error("Failed to load video");
        }
        const data = await resp.json();
        setVideoUrl(data.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load video");
      } finally {
        setLoading(false);
      }
    };

    fetchVideoUrl();
  }, [expanded, transcriptId, accessToken, videoUrl]);

  useEffect(() => {
    if (!videoUrl || !transcriptId) return;

    let cancelled = false;

    const fetchCaptions = async () => {
      try {
        const url = `${API_URL}/v1/transcripts/${transcriptId}?transcript_format=webvtt-named`;
        const headers: Record<string, string> = {};
        if (accessToken) {
          headers["Authorization"] = `Bearer ${accessToken}`;
        }
        const resp = await fetch(url, { headers });
        if (!resp.ok) return;
        const data = await resp.json();
        const vttContent = data?.transcript;
        if (!vttContent || cancelled) return;
        setRawVtt(vttContent);
      } catch {
        // Captions are non-critical — fail silently
      }
    };

    fetchCaptions();

    return () => {
      cancelled = true;
    };
  }, [videoUrl, transcriptId, accessToken]);

  // Rebuild blob URL whenever rawVtt or captionOffset changes
  useEffect(() => {
    if (!rawVtt) return;

    const shifted = shiftVttTimestamps(rawVtt, captionOffset);
    const blob = new Blob([shifted], { type: "text/vtt" });
    const blobUrl = URL.createObjectURL(blob);

    if (prevBlobUrl.current) {
      URL.revokeObjectURL(prevBlobUrl.current);
    }
    prevBlobUrl.current = blobUrl;
    setCaptionsUrl(blobUrl);

    return () => {
      URL.revokeObjectURL(blobUrl);
      prevBlobUrl.current = null;
    };
  }, [rawVtt, captionOffset]);

  const adjustOffset = useCallback((delta: number) => {
    setCaptionOffset((prev) => Math.round((prev + delta) * 10) / 10);
  }, []);

  const formattedOffset = useMemo(() => {
    const sign = captionOffset >= 0 ? "+" : "";
    return `${sign}${captionOffset.toFixed(1)}s`;
  }, [captionOffset]);

  const segments = useMemo(
    () => (rawVtt ? parseVttSegments(rawVtt) : []),
    [rawVtt],
  );

  // Track video currentTime and duration
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => {
      if (video.duration && isFinite(video.duration)) {
        setVideoDuration(video.duration);
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onDurationChange);
    video.addEventListener("durationchange", onDurationChange);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onDurationChange);
      video.removeEventListener("durationchange", onDurationChange);
    };
  }, [videoUrl]);

  const handleSeek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  if (!expanded) return null;

  if (loading) {
    return (
      <Box
        borderRadius="md"
        overflow="hidden"
        bg="gray.900"
        w="fit-content"
        maxW="100%"
      >
        <Skeleton h="200px" w="400px" maxW="100%" />
      </Box>
    );
  }

  if (error || !videoUrl) {
    return (
      <Box
        p={3}
        bg="red.100"
        borderRadius="md"
        role="alert"
        w="fit-content"
        maxW="100%"
      >
        <Text fontSize="sm">{error || "Failed to load video recording"}</Text>
      </Box>
    );
  }

  return (
    <Box borderRadius="md" bg="black" w="fit-content" maxW="100%" mx="auto">
      {/* Header bar with title and close button */}
      <Flex
        align="center"
        justify="space-between"
        px={3}
        py={1.5}
        bg="gray.800"
        borderTopRadius="md"
        gap={4}
      >
        <Flex align="center" gap={2}>
          <LuVideo size={14} color="white" />
          <Text fontSize="xs" fontWeight="medium" color="white">
            Cloud recording
          </Text>
          {duration != null && (
            <Text fontSize="xs" color="gray.400">
              {formatDuration(duration)}
            </Text>
          )}
        </Flex>
        <Flex align="center" gap={3}>
          {rawVtt && (
            <Flex align="center" gap={1}>
              <Text fontSize="2xs" color="gray.400">
                CC sync
              </Text>
              <Flex
                align="center"
                justify="center"
                borderRadius="sm"
                p={0.5}
                cursor="pointer"
                onClick={() => adjustOffset(-0.5)}
                _hover={{ bg: "whiteAlpha.300" }}
                transition="background 0.15s"
              >
                <LuMinus size={12} color="white" />
              </Flex>
              <Text
                fontSize="2xs"
                color="gray.300"
                fontFamily="mono"
                minW="3.5em"
                textAlign="center"
              >
                {formattedOffset}
              </Text>
              <Flex
                align="center"
                justify="center"
                borderRadius="sm"
                p={0.5}
                cursor="pointer"
                onClick={() => adjustOffset(0.5)}
                _hover={{ bg: "whiteAlpha.300" }}
                transition="background 0.15s"
              >
                <LuPlus size={12} color="white" />
              </Flex>
            </Flex>
          )}
          <Flex
            align="center"
            justify="center"
            borderRadius="full"
            p={1}
            cursor="pointer"
            onClick={onClose}
            _hover={{ bg: "whiteAlpha.300" }}
            transition="background 0.15s"
          >
            <LuX size={14} color="white" />
          </Flex>
        </Flex>
      </Flex>
      {/* Video element with visible controls */}
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        autoPlay
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()}
        style={{
          display: "block",
          width: "100%",
          maxWidth: "640px",
          maxHeight: "45vh",
          minHeight: "180px",
          objectFit: "contain",
          background: "black",
          ...(segments.length === 0
            ? {
                borderBottomLeftRadius: "0.375rem",
                borderBottomRightRadius: "0.375rem",
              }
            : {}),
        }}
      >
        {captionsUrl && (
          <track
            kind="captions"
            src={captionsUrl}
            srcLang={sourceLanguage || "en"}
            label="Auto-generated captions"
            default
          />
        )}
      </video>
      {segments.length > 0 && videoDuration > 0 && (
        <SpeakerProgressBar
          segments={segments}
          videoDuration={videoDuration}
          currentTime={currentTime}
          captionOffset={captionOffset}
          onSeek={handleSeek}
          participants={participants}
        />
      )}
    </Box>
  );
}
