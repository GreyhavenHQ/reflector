import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Flex, Skeleton, Text } from "@chakra-ui/react";
import { LuMinus, LuPlus, LuVideo, LuX } from "react-icons/lu";
import { useAuth } from "../../lib/AuthProvider";
import { API_URL } from "../../lib/apiClient";

type VideoPlayerProps = {
  transcriptId: string;
  duration: number | null;
  expanded: boolean;
  onClose: () => void;
  sourceLanguage?: string | null;
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

export default function VideoPlayer({
  transcriptId,
  duration,
  expanded,
  onClose,
  sourceLanguage,
}: VideoPlayerProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [rawVtt, setRawVtt] = useState<string | null>(null);
  const [captionsUrl, setCaptionsUrl] = useState<string | null>(null);
  const [captionOffset, setCaptionOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevBlobUrl = useRef<string | null>(null);
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
          borderBottomLeftRadius: "0.375rem",
          borderBottomRightRadius: "0.375rem",
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
    </Box>
  );
}
