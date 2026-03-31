import { useState, useEffect } from "react";
import { TopicWordsEditor } from "./TopicWordsEditor";
import { ParticipantSidebar } from "./ParticipantSidebar";
import { SelectedText } from "./types";
import { useTranscriptParticipants } from "../../../lib/apiHooks";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";

type CorrectionEditorProps = {
  transcriptId: string;
  topics: any[]; // List of topic objects [{id, title, ...}]
  onClose: () => void;
};

export function CorrectionEditor({ transcriptId, topics, onClose }: CorrectionEditorProps) {
  const [currentTopicId, setCurrentTopicId] = useState<string | null>(null);
  const stateSelectedText = useState<SelectedText>(undefined);
  
  const { data: participantsData, isLoading: isParticipantsLoading, refetch: refetchParticipants } = useTranscriptParticipants(transcriptId as any);

  // Initialize with first topic or restored session topic
  useEffect(() => {
    if (topics && topics.length > 0 && !currentTopicId) {
      const sessionTopic = window.localStorage.getItem(`${transcriptId}_correct_topic`);
      if (sessionTopic && topics.find((t: any) => t.id === sessionTopic)) {
        setCurrentTopicId(sessionTopic);
      } else {
        setCurrentTopicId(topics[0].id);
      }
    }
  }, [topics, currentTopicId, transcriptId]);

  // Persist current topic to local storage tracking
  useEffect(() => {
    if (currentTopicId) {
      window.localStorage.setItem(`${transcriptId}_correct_topic`, currentTopicId);
    }
  }, [currentTopicId, transcriptId]);

  const currentIndex = topics.findIndex((t: any) => t.id === currentTopicId);
  const currentTopic = topics[currentIndex];
  
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < topics.length - 1;

  const onPrev = () => { if (canGoPrev) setCurrentTopicId(topics[currentIndex - 1].id); };
  const onNext = () => { if (canGoNext) setCurrentTopicId(topics[currentIndex + 1].id); };

  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      // Don't intercept if they are typing in an input!
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    document.addEventListener("keyup", keyHandler);
    return () => document.removeEventListener("keyup", keyHandler);
  }, [currentIndex, topics]);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full relative">
      <div className="flex items-center justify-between p-4 bg-surface-low border-b border-outline-variant/10 rounded-t-xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-surface-high p-1 rounded-md border border-outline-variant/20">
            <button 
              onClick={onPrev} 
              disabled={!canGoPrev}
              className="p-1.5 rounded hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Previous Topic (Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={onNext} 
              disabled={!canGoNext}
              className="p-1.5 rounded hover:bg-surface disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Next Topic (Right Arrow)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-muted bg-surface-high px-2 py-1 rounded">
              {currentIndex >= 0 ? currentIndex + 1 : 0} / {topics.length}
            </span>
            <h3 className="font-serif text-lg font-bold truncate max-w-[300px]">
              {currentTopic?.title || "Loading..."}
            </h3>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="p-2 text-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-full"
          title="Exit Correction Mode"
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Editor Central Area */}
        <div className="flex-1 p-6 overflow-y-auto bg-surface relative min-h-0">
          <div className="max-w-3xl mx-auto h-full pr-4">
            <h4 className="text-xs font-bold tracking-widest text-primary uppercase mb-6 flex items-center">
              <span className="w-2 h-2 rounded-full bg-primary mr-2 animate-pulse"></span>
              Correction Mode
            </h4>
            
            {currentTopicId ? (
              <TopicWordsEditor 
                transcriptId={transcriptId} 
                topicId={currentTopicId} 
                stateSelectedText={stateSelectedText}
                participants={participantsData || []}
              />
            ) : (
              <div className="text-muted text-sm text-center py-20">No topic selected</div>
            )}
          </div>
        </div>

        {/* Participant Assignment Sidebar */}
        <div className="w-80 shrink-0 border-l border-outline-variant/10 bg-surface-low p-4 overflow-y-auto hidden md:block min-h-0">
          {currentTopicId && (
            <ParticipantSidebar 
              transcriptId={transcriptId}
              topicId={currentTopicId}
              participants={participantsData || []}
              isParticipantsLoading={isParticipantsLoading}
              refetchParticipants={refetchParticipants}
              stateSelectedText={stateSelectedText}
            />
          )}
        </div>
      </div>
    </div>
  );
}
