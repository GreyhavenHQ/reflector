import { useEffect, useState } from "react";
import { useTranscriptWebRTC } from "../../lib/apiHooks";

export const useWebRTC = (stream: MediaStream | null, transcriptId: string | null): RTCPeerConnection | null => {
  const [peer, setPeer] = useState<RTCPeerConnection | null>(null);
  const { mutateAsync: mutateWebRtcTranscriptAsync } = useTranscriptWebRTC();

  useEffect(() => {
    if (!stream || !transcriptId) {
      return;
    }

    let pc: RTCPeerConnection;

    const setupConnection = async () => {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      // Add local audio tracks to the peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      try {
        // Create an offer. Since HTTP signaling doesn't stream ICE candidates, 
        // we can wait for ICE gathering to complete before sending SDP.
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Wait for ICE gathering to complete so SDP has all local candidates
        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === "complete") {
            resolve();
          } else {
            const checkState = () => {
              if (pc.iceGatheringState === "complete") {
                pc.removeEventListener("icegatheringstatechange", checkState);
                resolve();
              }
            };
            pc.addEventListener("icegatheringstatechange", checkState);
            
            // Fallback timeout just in case ICE STUN gathering hangs
            setTimeout(() => {
              pc.removeEventListener("icegatheringstatechange", checkState);
              resolve();
            }, 2000);
          }
        });

        const rtcOffer = {
          sdp: pc.localDescription!.sdp,
          type: pc.localDescription!.type,
        };

        const answer = await mutateWebRtcTranscriptAsync({
          params: {
            path: {
              transcript_id: transcriptId as any,
            },
          },
          body: rtcOffer as any,
        });

        await pc.setRemoteDescription(new RTCSessionDescription(answer as RTCSessionDescriptionInit));
        setPeer(pc);

      } catch (err) {
        console.error("Failed to establish WebRTC connection", err);
      }
    };

    setupConnection();

    return () => {
      if (pc) {
        pc.close();
      }
      setPeer(null);
    };
  }, [stream, transcriptId, mutateWebRtcTranscriptAsync]);

  return peer;
};
