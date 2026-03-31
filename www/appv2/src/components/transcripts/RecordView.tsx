import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.js';
import { useAudioDevice } from '../../hooks/useAudioDevice';
import { useWebSockets } from '../../hooks/transcripts/useWebSockets';
import { useWebRTC } from '../../hooks/transcripts/useWebRTC';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Mic, Play, Square, StopCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface RecordViewProps {
  transcriptId: string;
}

export function RecordView({ transcriptId }: RecordViewProps) {
  const navigate = useNavigate();
  const waveformRef = useRef<HTMLDivElement>(null);
  
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null);
  const [recordPlugin, setRecordPlugin] = useState<any>(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentStream, setCurrentStream] = useState<MediaStream | null>(null);
  const [isConfirmEndOpen, setIsConfirmEndOpen] = useState(false);

  const { permissionOk, requestPermission, audioDevices } = useAudioDevice();
  const [selectedDevice, setSelectedDevice] = useState<string>('');

  // Establish WebSockets for transcription data and exact API duration tracking
  const wsData = useWebSockets(transcriptId);
  const _rtcPeerConnection = useWebRTC(currentStream, isRecording ? transcriptId : null);

  useEffect(() => {
    if (audioDevices.length > 0) {
      setSelectedDevice(audioDevices[0].value);
    }
  }, [audioDevices]);

  // Handle server redirection upon stream termination & successful inference processing
  useEffect(() => {
    if (wsData.status?.value === "ended" || wsData.status?.value === "error") {
      navigate(`/transcriptions/${transcriptId}`);
    }
  }, [wsData.status?.value, navigate, transcriptId]);

  useEffect(() => {
    if (!waveformRef.current) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(160, 154, 142, 0.5)',
      progressColor: '#DC5A28',
      height: 100,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      normalize: true,
      cursorWidth: 0,
    });

    const rec = ws.registerPlugin(RecordPlugin.create({
      scrollingWaveform: true,
      renderRecordedAudio: false,
    }));

    setWavesurfer(ws);
    setRecordPlugin(rec);

    return () => {
      rec.destroy();
      ws.destroy();
    };
  }, []);

  const startRecording = async () => {
    if (!permissionOk) {
      requestPermission();
      return;
    }
    
    if (recordPlugin) {
      try {
        // Native browser constraints specifically isolated for the elected input device
        const freshStream = await navigator.mediaDevices.getUserMedia({
          audio: selectedDevice ? { deviceId: { exact: selectedDevice } } : true
        });

        setCurrentStream(freshStream);
        
        // Push duplicate explicit stream into Wavesurfer record plugin
        await recordPlugin.startRecording(freshStream);
        
        setIsRecording(true);
        setIsPaused(false);
      } catch (err) {
        console.error("Failed to inject stream into local constraints", err);
      }
    }
  };

  const pauseRecording = () => {
    if (recordPlugin && isRecording) {
      if (isPaused) {
        recordPlugin.resumeRecording();
        setIsPaused(false);
      } else {
        recordPlugin.pauseRecording();
        setIsPaused(true);
      }
    }
  };

  const stopRecording = () => {
    setIsConfirmEndOpen(false);
    if (recordPlugin && isRecording) {
      recordPlugin.stopRecording();
      setIsRecording(false);
      setIsPaused(false);

      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        setCurrentStream(null);
      }
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds == null) return "00:00:00";
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col w-full max-w-4xl mx-auto px-6 py-12 h-screen max-h-screen">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="font-serif font-bold text-3xl text-on-surface">Live Recording</h2>
          <p className="text-on-surface-variant mt-1 text-sm">
            Capturing audio for transcript ID: {transcriptId.substring(0, 8)}...
          </p>
        </div>
        
        <div className="w-64">
          <select 
            className="w-full bg-surface-low border border-outline-variant/30 text-on-surface text-sm rounded-lg px-3 py-2 outline-none focus:border-primary transition-colors cursor-pointer"
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            disabled={isRecording}
          >
            {audioDevices.map(device => (
              <option key={device.value} value={device.value}>{device.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-surface-low p-8 rounded-2xl border border-outline-variant/20 shadow-sm flex flex-col mb-8 relative">
        {/* Dynamic websocket ping duration display mapped off python API output */}
        {isRecording && (
          <div className="absolute top-4 left-6 flex items-center gap-3 bg-red-500/10 text-red-600 px-3 py-1.5 rounded-full z-20">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="font-mono text-sm font-bold tracking-wider">{formatDuration(wsData.duration)}</span>
          </div>
        )}

        {/* Visualization Area */}
        <div className="bg-surface-mid rounded-xl overflow-hidden p-6 mb-8 border border-outline-variant/30 relative h-[160px] flex items-center justify-center">
          {!permissionOk && !isRecording && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
              <Mic className="w-8 h-8 text-white/50 mb-2" />
              <Button variant="secondary" onClick={requestPermission} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                Allow Microphone
              </Button>
            </div>
          )}
          <div ref={waveformRef} className="w-full relative z-0" />
        </div>

        {/* Play/Pause/Stop Global Controls */}
        <div className="flex items-center justify-center gap-6">
          {!isRecording ? (
            <Button 
              onClick={startRecording} 
              disabled={!permissionOk}
              className="bg-red-500 hover:bg-red-600 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.4)] hover:shadow-[0_0_20px_rgba(239,68,68,0.6)] transition-all"
            >
              <div className="w-5 h-5 bg-white rounded-full" />
            </Button>
          ) : (
            <>
              {/* Note: WebRTC streams are natively active until tracks are stripped. 
                  Therefore 'pause' locally suspends WaveSurfer drawing logic, 
                  but active WebRTC pipe persists until standard "stop" terminates it. 
              */}
              <Button 
                onClick={pauseRecording} 
                className="bg-surface-high hover:bg-outline-variant/20 text-on-surface rounded-full w-14 h-14 flex items-center justify-center transition-colors"
                title={isPaused ? "Resume visualization" : "Pause visualization"}
              >
                {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Square className="w-5 h-5 fill-current" />}
              </Button>

              <Button 
                onClick={() => setIsConfirmEndOpen(true)} 
                className="bg-red-500 hover:bg-red-600 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-lg shadow-red-500/20"
                title="Conclude Recording & Proceed"
              >
                <StopCircle className="w-8 h-8" />
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Live Transcript Pane tracking wsData real-time ingestion */}
      <div className="flex-1 bg-surface-low rounded-2xl border border-outline-variant/20 p-6 flex flex-col overflow-hidden">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-4 flex items-center gap-2">
          {isRecording && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
          Live Transcript Pipeline
        </h3>
        
        <div className="flex-1 overflow-y-auto w-full max-w-full">
           {wsData.transcriptTextLive || wsData.accumulatedText ? (
             <div className="text-on-surface font-sans text-lg leading-relaxed flex flex-col gap-2">
               <span className="opacity-60">{wsData.accumulatedText.replace(wsData.transcriptTextLive, '').trim()}</span>
               <span className="font-semibold">{wsData.transcriptTextLive}</span>
             </div>
           ) : (
             <div className="h-full flex items-center justify-center text-on-surface-variant font-mono text-sm opacity-50">
                {isRecording ? "Transmitting audio and calculating text..." : "Connect WebRTC to preview transcript pipeline."}
             </div>
           )}
        </div>
      </div>
      
      <ConfirmModal
        isOpen={isConfirmEndOpen}
        onClose={() => setIsConfirmEndOpen(false)}
        onConfirm={stopRecording}
        title="End Live Recording"
        description="Are you sure you want to stop recording? This will finalize the transcript and begin generating summaries. You will not be able to resume this session."
        confirmText="Yes, End Recording"
        isDestructive={false}
      />
    </div>
  );
}
