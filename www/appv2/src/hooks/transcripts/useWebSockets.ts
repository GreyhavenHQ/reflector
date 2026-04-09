import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WEBSOCKET_URL } from "../../lib/apiClient";
import { useAuth } from "../../lib/AuthProvider";
import { parseNonEmptyString } from "../../lib/utils";
import { getReconnectDelayMs, MAX_RETRIES } from "./webSocketReconnect";
import { Topic, FinalSummary, Status } from "./webSocketTypes";
import type { components, operations } from "../../lib/reflector-api";

type AudioWaveform = components["schemas"]["AudioWaveform"];
type TranscriptWsEvent = operations["v1_transcript_get_websocket_events"]["responses"][200]["content"]["application/json"];

export type UseWebSockets = {
  transcriptTextLive: string;
  accumulatedText: string;
  title: string;
  topics: Topic[];
  finalSummary: FinalSummary;
  status: Status | null;
  waveform: AudioWaveform | null;
  duration: number | null;
};

export const useWebSockets = (transcriptId: string | null): UseWebSockets => {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const [transcriptTextLive, setTranscriptTextLive] = useState<string>("");
  const [accumulatedText, setAccumulatedText] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [waveform, setWaveForm] = useState<AudioWaveform | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [finalSummary, setFinalSummary] = useState<FinalSummary>({ summary: "" });
  const [status, setStatus] = useState<Status | null>(null);

  const [textQueue, setTextQueue] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Smooth out rapid text pushes
  useEffect(() => {
    if (isProcessing || textQueue.length === 0) return;

    setIsProcessing(true);
    const text = textQueue[0];
    setTranscriptTextLive(text);

    const WPM_READING = 200 + textQueue.length * 10;
    const wordCount = text.split(/\s+/).length;
    const delay = (wordCount / WPM_READING) * 60 * 1000;
    
    setTimeout(() => {
      setIsProcessing(false);
      setTextQueue((prevQueue) => prevQueue.slice(1));
    }, delay);
  }, [textQueue, isProcessing]);

  useEffect(() => {
    if (!transcriptId) return;
    const tsId = parseNonEmptyString(transcriptId);

    const url = `${WEBSOCKET_URL}/v1/transcripts/${transcriptId}/events`;
    let ws: WebSocket | null = null;
    let retryCount = 0;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let intentionalClose = false;

    const connect = () => {
      const subprotocols =
        auth.status === "authenticated" && (auth as any).accessToken
          ? ["bearer", (auth as any).accessToken]
          : undefined;
          
      ws = new WebSocket(url, subprotocols);

      ws.onopen = () => {
        console.debug("Transcript WebSocket connected");
        retryCount = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: TranscriptWsEvent = JSON.parse(event.data);

          switch (message.event) {
            case "TRANSCRIPT": {
              const newText = (message.data.text ?? "").trim();
              if (!newText) break;
              setTextQueue((prev) => [...prev, newText]);
              setAccumulatedText((prev) => prev + " " + newText);
              break;
            }
            case "TOPIC":
              setTopics((prevTopics) => {
                const topic = message.data;
                const index = prevTopics.findIndex((prev) => prev.id === topic.id);
                if (index >= 0) {
                  prevTopics[index] = topic;
                  return [...prevTopics];
                }
                return [...prevTopics, topic];
              });
              break;
            case "FINAL_LONG_SUMMARY":
              setFinalSummary({ summary: message.data.long_summary });
              break;
            case "FINAL_TITLE":
              setTitle(message.data.title);
              break;
            case "WAVEFORM":
              setWaveForm({ data: message.data.waveform });
              break;
            case "DURATION":
              setDuration(message.data.duration);
              break;
            case "STATUS":
              setStatus(message.data as any);
              if (message.data.value === "ended" || message.data.value === "error") {
                intentionalClose = true;
                ws?.close();
                // We should invalidate standard hooks here theoretically...
                // queryClient.invalidateQueries({ queryKey: ["transcript", tsId] });
              }
              break;
            case "ACTION_ITEMS":
            case "FINAL_SHORT_SUMMARY":
              break;
            default:
              console.warn(`Unknown WebSocket event: ${(message as any).event}`);
          }
        } catch (error) {
          console.error("Payload parse error", error);
        }
      };

      ws.onerror = (error) => {
        console.error("Transcript WebSocket error:", error);
      };

      ws.onclose = (event) => {
        if (intentionalClose) return;

        const normalCodes = [1000, 1001, 1005];
        if (normalCodes.includes(event.code)) return;

        if (retryCount < MAX_RETRIES) {
          const delay = getReconnectDelayMs(retryCount);
          retryCount++;
          retryTimeout = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      intentionalClose = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      ws?.close();
    };
  }, [transcriptId, auth.status, (auth as any).accessToken, queryClient]);

  return {
    transcriptTextLive,
    accumulatedText,
    topics,
    finalSummary,
    title,
    status,
    waveform,
    duration,
  };
};
