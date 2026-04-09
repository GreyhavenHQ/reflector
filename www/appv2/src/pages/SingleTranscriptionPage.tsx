import React, { useRef, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePlayerStore } from '../stores/usePlayerStore';
import {
  Play,
  Pause,
  Search,
  ChevronDown,
  ChevronRight,
  Edit3,
  Share2,
  Download,
  Copy,
  ChevronLeft,
  VolumeX,
} from 'lucide-react';

import { useTranscriptGet, useTranscriptTopicsWithWords, useTranscriptWaveform } from '../lib/apiHooks';
import { useAuth } from '../lib/AuthProvider';
import { UploadView } from '../components/transcripts/UploadView';
import { RecordView } from '../components/transcripts/RecordView';
import { ProcessingView } from '../components/transcripts/ProcessingView';
import { CorrectionEditor } from '../components/transcripts/correction/CorrectionEditor';

// Utility component to handle routing logic automatically based on fetch state
export default function SingleTranscriptionPage() {
  const { id } = useParams<{ id: string }>();
  const { data: transcript, isLoading, error } = useTranscriptGet(id as any);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px] w-full max-w-2xl mx-auto px-6">
        <div className="text-center text-on-surface-variant font-medium">Loading Transcript Data...</div>
      </div>
    );
  }

  if (error || !transcript) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[500px] w-full max-w-2xl mx-auto px-6">
        <div className="text-center text-red-500 font-medium">Error loading transcript. It may not exist.</div>
      </div>
    );
  }

  const status = transcript.status;

  // View routing based on status
  if (status === 'processing' || status === 'uploaded') {
    return <ProcessingView />;
  }

  if (status === 'recording') {
    return <RecordView transcriptId={id as string} />;
  }

  if (status === 'idle') {
    if (transcript.source_kind === 'file') {
      return <UploadView transcriptId={id as string} />;
    } else {
      return <RecordView transcriptId={id as string} />;
    }
  }

  // If status is 'ended', we render the actual document
  return <TranscriptViewer transcript={transcript} id={id as string} />;
}

// Extract the Viewer UI Core logic for the finalized state
function TranscriptViewer({ transcript, id }: { transcript: any; id: string }) {
  const navigate = useNavigate();
  const auth = useAuth();
  const accessToken = auth.status === 'authenticated' ? auth.accessToken : null;
  const { isPlaying, setPlaying, currentTime, setCurrentTime } = usePlayerStore();

  const audioDeleted = transcript.audio_deleted === true;

  const { data: topicsData, isLoading: topicsLoading } = useTranscriptTopicsWithWords(id as any);
  // Skip waveform fetch when audio is deleted — endpoint returns 404 and there's nothing to display
  const { data: waveformData } = useTranscriptWaveform(audioDeleted ? null : id as any);

  const audioRef = useRef<HTMLAudioElement>(null);

  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [isCorrectionMode, setIsCorrectionMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const displayTitle = transcript.title || 'Untitled Meeting';
  // API returns duration in milliseconds; audio currentTime is in seconds
  const duration = transcript.duration ? transcript.duration / 1000 : 0;
  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  const rawWaveform: number[] = (waveformData?.data ?? []) as number[];

  // Downsample to ~200 bars then normalize so the tallest bar always fills the container
  const sampledWaveform = (() => {
    if (!rawWaveform.length) return [];
    const targetBars = 200;
    const step = Math.max(1, Math.floor(rawWaveform.length / targetBars));
    const bars: number[] = [];
    for (let i = 0; i < rawWaveform.length && bars.length < targetBars; i += step) {
      bars.push(rawWaveform[i]);
    }
    const maxAmp = Math.max(...bars, 0.001);
    return bars.map(v => v / maxAmp);
  })();

  const [hoveredBar, setHoveredBar] = useState<{ index: number; x: number; y: number } | null>(null);

  // Flat sorted segment list for O(n) speaker lookup at any timestamp
  const allSegments = useMemo(() => {
    if (!topicsData) return [];
    return (topicsData as any[])
      .flatMap((topic: any) => topic.segments ?? [])
      .sort((a: any, b: any) => a.start - b.start);
  }, [topicsData]);

  // Filter topics/segments by search query; auto-expand topics with hits
  const q = searchQuery.trim().toLowerCase();
  const filteredTopics = useMemo(() => {
    if (!topicsData) return [];
    if (!q) return topicsData as any[];
    return (topicsData as any[])
      .map((topic: any) => {
        const titleMatch = topic.title?.toLowerCase().includes(q);
        const matchingSegments = (topic.segments ?? []).filter((s: any) =>
          s.text?.toLowerCase().includes(q)
        );
        if (!titleMatch && matchingSegments.length === 0) return null;
        return { ...topic, _matchingSegments: matchingSegments };
      })
      .filter(Boolean);
  }, [topicsData, q]);

  const totalMatches = useMemo(() =>
    filteredTopics.reduce((acc: number, t: any) => acc + (t._matchingSegments?.length ?? 0), 0),
    [filteredTopics]
  );

  // Highlight matching text within a string
  const highlight = (text: string) => {
    if (!q) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-primary/20 text-on-surface rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const getSegmentAtTime = (timeSeconds: number) => {
    let result: any = null;
    for (const seg of allSegments) {
      if (seg.start <= timeSeconds) result = seg;
      else break;
    }
    return result;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const jumpToTime = (timeInSeconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = timeInSeconds;
      setCurrentTime(timeInSeconds);
      if (!isPlaying) {
        audioRef.current.play();
        setPlaying(true);
      }
    }

    // Expand the topic that contains this timestamp (if collapsed) and scroll to the segment
    if (topicsData && (topicsData as any[]).length > 0) {
      const topics = topicsData as any[];
      let containingTopic: any = null;
      for (const t of topics) {
        if (t.timestamp <= timeInSeconds) containingTopic = t;
        else break;
      }
      if (containingTopic) {
        setExpandedChapters(prev => ({ ...prev, [containingTopic.id]: true }));
        setTimeout(() => {
          const segments: any[] = containingTopic.segments ?? [];
          let activeSeg: any = null;
          for (const s of segments) {
            if (s.start <= timeInSeconds) activeSeg = s;
            else break;
          }
          if (activeSeg) {
            document.getElementById(`line-${activeSeg.start}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 80);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickPos = (e.clientX - rect.left) / rect.width;
    jumpToTime(clickPos * duration);
  };

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters(prev => ({
      ...prev,
      [chapterId]: prev[chapterId] !== false ? false : true
    }));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 min-h-0 bg-surface flex flex-col font-sans text-on-surface selection:bg-primary/20 overflow-hidden">
      {/* Native audio element — hidden, only mounted when audio is available */}
      {!audioDeleted && (
        <audio
          ref={audioRef}
          src={`/v1/transcripts/${id}/audio/mp3${accessToken ? `?token=${accessToken}` : ''}`}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setPlaying(false)}
          preload="metadata"
        />
      )}

      {/* Waveform hover tooltip — fixed so it's never clipped by any overflow parent */}
      {hoveredBar && (() => {
        const t = (hoveredBar.index / sampledWaveform.length) * duration;
        const seg = getSegmentAtTime(t);
        return (
          <div
            className="fixed bg-on-surface text-surface text-xs px-2.5 py-1 rounded-lg whitespace-nowrap pointer-events-none z-[9999] shadow-md"
            style={{ left: `${hoveredBar.x}px`, top: `${hoveredBar.y - 8}px`, transform: 'translate(-50%, -100%)' }}
          >
            {seg ? `Speaker ${seg.speaker}` : '—'} · {formatTime(t)}
          </div>
        );
      })()}

      {/* Player Bar */}
      <div className="w-full bg-surface-high px-6 py-3.5 flex flex-col gap-3 sticky top-0 z-20 shadow-sm border-b border-outline-variant/20">
        {audioDeleted ? (
          <div className="flex items-center gap-3 text-muted text-sm py-1">
            <VolumeX className="w-4 h-4 shrink-0" />
            <span>Audio unavailable — a participant opted out of audio retention.</span>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              title={isPlaying ? "Pause audio" : "Play audio"}
              className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors shrink-0"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>

            <div className="flex-1 flex items-center gap-3">
              <span className="text-xs font-mono text-muted shrink-0">{formatTime(currentTime)}</span>

              {/* Waveform bars (with progress overlay) or fallback progress bar */}
              <div
                className="flex-1 h-14 flex items-end gap-[2px] cursor-pointer relative pb-1"
                onClick={handleSeek}
                onMouseMove={(e) => {
                  if (!sampledWaveform.length) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = e.clientX - rect.left;
                  const index = Math.min(
                    Math.floor((relX / rect.width) * sampledWaveform.length),
                    sampledWaveform.length - 1
                  );
                  setHoveredBar({ index, x: e.clientX, y: rect.top });
                }}
                onMouseLeave={() => setHoveredBar(null)}
              >
                {/* Topic title markers */}
                {duration > 0 && (topicsData as any[])?.map((topic: any) => {
                  const posPercent = (topic.timestamp / duration) * 100;
                  if (posPercent < 0 || posPercent > 100) return null;
                  const truncated = topic.title?.length > 14
                    ? topic.title.slice(0, 13) + '…'
                    : topic.title;
                  return (
                    <div
                      key={topic.id}
                      className="absolute top-0 flex flex-col items-start pointer-events-none select-none"
                      style={{ left: `${posPercent}%` }}
                    >
                      <span className="text-[10px] font-semibold text-on-surface-variant leading-none mb-[3px] whitespace-nowrap">
                        {truncated}
                      </span>
                      <div className="w-px h-2 bg-primary/50" />
                    </div>
                  );
                })}

                {sampledWaveform.length > 0 ? (
                  sampledWaveform.map((amplitude, i) => {
                    const barPercent = (i / sampledWaveform.length) * 100;
                    const isPast = barPercent < progressPercent;
                    const isHovered = hoveredBar?.index === i;
                    const barHeight = Math.max(3, Math.round(amplitude * 44));
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-full transition-colors"
                        style={{
                          height: `${barHeight}px`,
                          backgroundColor: isHovered
                            ? '#DC5A28'
                            : isPast
                              ? 'rgba(220, 90, 40, 0.7)'
                              : 'rgba(160, 154, 142, 0.35)',
                        }}
                      />
                    );
                  })
                ) : (
                  <div className="w-full h-3 bg-surface-mid rounded-full relative overflow-hidden">
                    <div
                      className="absolute top-0 left-0 bottom-0 bg-primary/80 transition-all rounded-full pointer-events-none"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}
              </div>

              <span className="text-xs font-mono text-muted shrink-0">{formatTime(duration)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row w-full max-w-[1600px] mx-auto overflow-hidden">

        {/* Left Column: Summary */}
        <div className="flex-1 lg:w-[55%] flex flex-col border-r border-outline-variant/10 overflow-y-auto min-h-0">
          {/* Breadcrumb */}
          <div className="p-4 border-b border-outline-variant/10">
            <button
              onClick={() => navigate('/transcriptions')}
              title="Return to your transcripts archive"
              className="flex items-center gap-2 text-muted hover:text-primary transition-colors text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Archive
            </button>
          </div>

          <div className="p-8 md:p-10 max-w-3xl mx-auto w-full">
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="font-serif text-3xl font-bold text-on-surface">{displayTitle}</h1>
                <div className="flex items-center gap-1 ml-1">
                  {[
                    { icon: <Edit3 className="w-4 h-4" />, label: 'Edit title', onClick: undefined },
                    { icon: <Copy className="w-4 h-4" />, label: 'Copy transcript', onClick: undefined },
                    { icon: <Download className="w-4 h-4" />, label: 'Export as text', onClick: undefined },
                    { icon: <Share2 className="w-4 h-4" />, label: 'Share transcript', onClick: undefined },
                  ].map(({ icon, label, onClick }) => (
                    <div key={label} className="relative group/tip">
                      <button
                        onClick={onClick}
                        className="p-1.5 text-muted hover:text-on-surface transition-colors rounded hover:bg-surface-high"
                      >
                        {icon}
                      </button>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-on-surface text-surface text-[11px] rounded whitespace-nowrap pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity z-50 shadow-sm">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted flex items-center gap-2">
                <span>{new Date(transcript.created_at).toLocaleDateString()}</span>
                <span>•</span>
                <span>{transcript.source_language?.toUpperCase() || 'EN'}</span>
              </p>
            </div>

            {transcript.short_summary && (
              <section className="mb-10 bg-surface-low p-6 rounded-xl border border-outline-variant/10 relative group shadow-sm">
                <button title="Edit summary text" className="absolute top-4 right-4 p-1.5 text-muted hover:text-primary opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-surface-high">
                  <Edit3 className="w-4 h-4" />
                </button>
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span> Quick Recap
                </h3>
                <p className="font-serif text-[1.1rem] text-on-surface leading-relaxed">
                  {transcript.short_summary}
                </p>
              </section>
            )}

            {transcript.long_summary && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted mb-4">Executive Summary</h3>
                <div className="space-y-4 text-on-surface-variant text-[0.9375rem] leading-relaxed whitespace-pre-wrap">
                  {transcript.long_summary}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Right Column: Chapters & Transcript */}
        <div className="flex-1 lg:w-[45%] flex flex-col bg-surface-low overflow-hidden min-h-0">
          {isCorrectionMode ? (
            <CorrectionEditor
              transcriptId={id}
              topics={topicsData || []}
              onClose={() => setIsCorrectionMode(false)}
            />
          ) : (
            <>
              <div className="p-6 border-b border-outline-variant/10 bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif text-xl font-bold text-on-surface">Transcript</h2>
                  <div className="flex items-center gap-2">
                    {!audioDeleted && (
                      <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">Sync Active</span>
                    )}
                    <button onClick={() => setIsCorrectionMode(true)} className="ml-2 text-xs font-medium bg-surface-high hover:bg-surface text-on-surface px-3 py-1 border border-outline-variant/10 rounded flex items-center gap-1 transition-colors">
                      <Edit3 className="w-3 h-3" />
                      Correct
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-20 py-2 bg-surface border border-outline-variant/20 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm text-on-surface placeholder:text-muted"
                    placeholder="Search in transcript..."
                  />
                  {q && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted font-medium">
                      {totalMatches} match{totalMatches !== 1 ? 'es' : ''}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth" id="transcript-scroll-container">
                {topicsLoading ? (
                   <div className="text-center text-muted font-medium text-sm pt-12">Loading conversation...</div>
                ) : filteredTopics.length > 0 ? (
                   filteredTopics.map((topic: any, idx: number) => {
                     // When searching, force-expand topics with matches
                     const isExpanded = q ? true : expandedChapters[topic.id] !== false;
                     const matchingSegmentStarts = new Set<number>(
                       (topic._matchingSegments ?? []).map((s: any) => s.start)
                     );
                     return (
                      <div key={topic.id} className="relative">
                        <div
                          className={`flex items-start gap-3 mb-4 cursor-pointer group hover:text-primary transition-colors ${isExpanded ? 'text-primary' : 'text-on-surface-variant'}`}
                          onClick={() => toggleChapter(topic.id)}
                          title={isExpanded ? "Collapse chapter" : "Expand chapter"}
                        >
                          <button className={`mt-0.5 p-0.5 rounded-sm transition-colors ${isExpanded ? 'bg-primary/10' : 'hover:bg-surface-high'}`}>
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <div>
                            <span className="font-mono text-xs font-medium opacity-60 mb-0.5 block">{formatTime(topic.timestamp)}</span>
                            <h3 className="font-serif font-bold text-lg leading-snug">{highlight(topic.title || `Chapter ${idx + 1}`)}</h3>
                          </div>
                        </div>

                        {isExpanded && topic.segments && (
                          <div className="pl-9 space-y-6 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-outline-variant/20">
                            {topic.segments.map((line: any, lIdx: number) => {
                              // When searching, dim segments that don't match
                              if (q && !matchingSegmentStarts.has(line.start)) return null;

                              // Sync active logic: matches current playback time to segment
                              const isActive = currentTime >= line.start && (!topic.segments[lIdx + 1] || currentTime < topic.segments[lIdx + 1].start);

                              if (isActive && isPlaying) {
                                setTimeout(() => {
                                  document.getElementById(`line-${line.start}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }, 50);
                              }

                              return (
                                <div key={`${line.start}-${lIdx}`} id={`line-${line.start}`} className="group relative">
                                  {isActive && (
                                    <div className="absolute -left-9 top-1.5 w-1.5 h-1.5 rounded-full bg-primary ring-4 ring-primary/10 transition-all shadow-sm shadow-primary"></div>
                                  )}
                                  <div className="flex items-baseline gap-3 mb-1">
                                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-muted group-hover:text-primary/70 transition-colors">
                                      Speaker {line.speaker}
                                    </span>
                                    <span
                                      onClick={() => jumpToTime(line.start)}
                                      title="Jump to time"
                                      className="text-[0.6875rem] font-mono text-muted opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-primary"
                                    >
                                      {formatTime(line.start)}
                                    </span>
                                  </div>
                                  <p
                                    onClick={() => jumpToTime(line.start)}
                                    title="Jump to this segment"
                                    className={`text-[0.9375rem] leading-relaxed cursor-pointer transition-colors ${isActive ? 'text-on-surface font-semibold bg-primary/5 rounded px-2 -mx-2 py-1' : 'text-on-surface-variant hover:text-on-surface'}`}
                                  >
                                    {highlight(line.text)}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                     )
                   })
                ) : q ? (
                    <div className="text-center text-muted font-medium text-sm pt-12">No results for "{searchQuery}"</div>
                ) : (
                    <div className="text-center text-muted font-medium text-sm pt-12">No transcription data available yet.</div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

    </div>
  );
}
