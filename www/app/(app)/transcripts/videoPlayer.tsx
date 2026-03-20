import { useEffect, useState } from "react";
import { Box, Flex, Skeleton, Text } from "@chakra-ui/react";
import { LuVideo, LuX } from "react-icons/lu";
import { useAuth } from "../../lib/AuthProvider";
import { API_URL } from "../../lib/apiClient";

type VideoPlayerProps = {
  transcriptId: string;
  duration: number | null;
  expanded: boolean;
  onClose: () => void;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VideoPlayer({
  transcriptId,
  duration,
  expanded,
  onClose,
}: VideoPlayerProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();
  const accessToken = auth.status === "authenticated" ? auth.accessToken : null;

  useEffect(() => {
    if (!expanded || !transcriptId || videoUrl) return;

    const fetchVideoUrl = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (accessToken) {
          params.set("token", accessToken);
        }
        const url = `${API_URL}/v1/transcripts/${transcriptId}/video/url?${params}`;
        const headers: Record<string, string> = {};
        if (accessToken) {
          headers["Authorization"] = `Bearer ${accessToken}`;
        }
        const resp = await fetch(url, { headers });
        if (!resp.ok) {
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
        <Text fontSize="sm">Failed to load video recording</Text>
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
      {/* Video element with visible controls */}
      <video
        src={videoUrl}
        controls
        autoPlay
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
      />
    </Box>
  );
}
