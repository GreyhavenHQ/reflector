import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  useTranscriptSpeakerAssign,
  useTranscriptSpeakerMerge,
  useTranscriptParticipantUpdate,
  useTranscriptParticipantCreate,
  useTranscriptParticipantDelete,
} from "../../../lib/apiHooks";
import { selectedTextIsSpeaker, selectedTextIsTimeSlice } from "./types";
import { Button } from "../../ui/Button";
import { CornerDownRight, Loader2 } from "lucide-react";

type ParticipantSidebarProps = {
  transcriptId: string;
  topicId: string;
  participants: any[];
  isParticipantsLoading: boolean;
  refetchParticipants: () => void;
  stateSelectedText: any;
};

export function ParticipantSidebar({
  transcriptId,
  participants,
  isParticipantsLoading,
  refetchParticipants,
  stateSelectedText,
}: ParticipantSidebarProps) {
  const speakerAssignMutation = useTranscriptSpeakerAssign();
  const speakerMergeMutation = useTranscriptSpeakerMerge();
  const participantUpdateMutation = useTranscriptParticipantUpdate();
  const participantCreateMutation = useTranscriptParticipantCreate();
  const participantDeleteMutation = useTranscriptParticipantDelete();

  const loading =
    speakerAssignMutation.isPending ||
    speakerMergeMutation.isPending ||
    participantUpdateMutation.isPending ||
    participantCreateMutation.isPending ||
    participantDeleteMutation.isPending;

  const [participantInput, setParticipantInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedText, setSelectedText] = stateSelectedText;
  const [selectedParticipant, setSelectedParticipant] = useState<any>();
  const [action, setAction] = useState<"Create" | "Create to rename" | "Create and assign" | "Rename" | null>(null);
  const [oneMatch, setOneMatch] = useState<any>();

  useEffect(() => {
    if (participants && participants.length > 0) {
      if (selectedTextIsSpeaker(selectedText)) {
        inputRef.current?.focus();
        const participant = participants.find((p) => p.speaker === selectedText);
        if (participant) {
          setParticipantInput(participant.name);
          setOneMatch(undefined);
          setSelectedParticipant(participant);
          setAction("Rename");
        } else {
          setSelectedParticipant(undefined);
          setParticipantInput("");
          setOneMatch(undefined);
          setAction("Create to rename");
        }
      }
      if (selectedTextIsTimeSlice(selectedText)) {
        inputRef.current?.focus();
        setParticipantInput("");
        setOneMatch(undefined);
        setAction("Create and assign");
        setSelectedParticipant(undefined);
      }

      if (typeof selectedText === "undefined") {
        inputRef.current?.blur();
        setSelectedParticipant(undefined);
        setAction(null);
      }
    }
  }, [selectedText, participants]);

  const onSuccess = () => {
    refetchParticipants();
    setAction(null);
    setSelectedText(undefined);
    setSelectedParticipant(undefined);
    setParticipantInput("");
    setOneMatch(undefined);
    inputRef?.current?.blur();
  };

  const assignTo = (participant: any) => async (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();

    if (loading || isParticipantsLoading) return;
    if (!selectedTextIsTimeSlice(selectedText)) return;

    try {
      await speakerAssignMutation.mutateAsync({
        params: { path: { transcript_id: transcriptId as any } },
        body: {
          participant: participant.id,
          timestamp_from: selectedText.start,
          timestamp_to: selectedText.end,
        },
      });
      onSuccess();
    } catch (error) {
      console.error(error);
    }
  };

  const mergeSpeaker = (speakerFrom: number, participantTo: any) => async () => {
    if (loading || isParticipantsLoading) return;

    if (participantTo.speaker) {
      try {
        await speakerMergeMutation.mutateAsync({
          params: { path: { transcript_id: transcriptId as any } },
          body: {
            speaker_from: speakerFrom,
            speaker_to: participantTo.speaker,
          },
        });
        onSuccess();
      } catch (error) {
        console.error(error);
      }
    } else {
      try {
        await participantUpdateMutation.mutateAsync({
          params: {
            path: {
              transcript_id: transcriptId as any,
              participant_id: participantTo.id,
            },
          },
          body: { speaker: speakerFrom },
        });
        onSuccess();
      } catch (error) {
        console.error(error);
      }
    }
  };

  const doAction = async (e?: any) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (loading || isParticipantsLoading || !participants) return;

    if (action === "Rename" && selectedTextIsSpeaker(selectedText)) {
      const participant = participants.find((p) => p.speaker === selectedText);
      if (participant && participant.name !== participantInput) {
        try {
          await participantUpdateMutation.mutateAsync({
            params: {
              path: {
                transcript_id: transcriptId as any,
                participant_id: participant.id,
              },
            },
            body: { name: participantInput },
          });
          refetchParticipants();
          setAction(null);
        } catch (e) {
          console.error(e);
        }
      }
    } else if (action === "Create to rename" && selectedTextIsSpeaker(selectedText)) {
      try {
        await participantCreateMutation.mutateAsync({
          params: { path: { transcript_id: transcriptId as any } },
          body: { name: participantInput, speaker: selectedText },
        });
        refetchParticipants();
        setParticipantInput("");
        setOneMatch(undefined);
      } catch (e) {
        console.error(e);
      }
    } else if (action === "Create and assign" && selectedTextIsTimeSlice(selectedText)) {
      try {
        const participant = await participantCreateMutation.mutateAsync({
          params: { path: { transcript_id: transcriptId as any } },
          body: { name: participantInput },
        });
        assignTo(participant)();
      } catch (error) {
        console.error(error);
      }
    } else if (action === "Create") {
      try {
        await participantCreateMutation.mutateAsync({
          params: { path: { transcript_id: transcriptId as any } },
          body: { name: participantInput },
        });
        refetchParticipants();
        setParticipantInput("");
        inputRef.current?.focus();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const deleteParticipant = (participantId: string) => async (e: any) => {
    e.stopPropagation();
    if (loading || isParticipantsLoading) return;
    try {
      await participantDeleteMutation.mutateAsync({
        params: {
          path: {
            transcript_id: transcriptId as any,
            participant_id: participantId,
          },
        },
      });
      refetchParticipants();
    } catch (e) {
      console.error(e);
    }
  };

  const selectParticipant = (participant: any) => (e: any) => {
    e.stopPropagation();
    setSelectedParticipant(participant);
    setSelectedText(participant.speaker);
    setAction("Rename");
    setParticipantInput(participant.name);
    oneMatch && setOneMatch(undefined);
  };

  const clearSelection = () => {
    setSelectedParticipant(undefined);
    setSelectedText(undefined);
    setAction(null);
    setParticipantInput("");
    oneMatch && setOneMatch(undefined);
  };

  const changeParticipantInput = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replaceAll(/,|\.| /g, "");
    setParticipantInput(value);
    if (value.length > 0 && participants && (action === "Create and assign" || action === "Create to rename")) {
      const matches = participants.filter((p) => p.name.toLowerCase().startsWith(value.toLowerCase()));
      if (matches.length === 1) {
        setOneMatch(matches[0]);
      } else {
        setOneMatch(undefined);
      }
    }
    if (value.length > 0 && !action) {
      setAction("Create");
    }
  };

  const anyLoading = loading || isParticipantsLoading;

  return (
    <div className="h-full flex flex-col w-full bg-surface-low border border-outline-variant/20 rounded-xl overflow-hidden shadow-sm" onClick={clearSelection}>
      <div className="p-4 border-b border-outline-variant/10 bg-surface/50" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          onChange={changeParticipantInput}
          value={participantInput}
          placeholder="Participant Name"
          className="w-full bg-surface border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 mb-3"
        />
        <Button
          onClick={doAction}
          disabled={!action || anyLoading}
          className="w-full py-2 bg-primary text-white flex items-center justify-center font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {!anyLoading ? (
            <>
              <CornerDownRight className="w-3 h-3 mr-2 opacity-70" />
              {action || "Create"}
            </>
          ) : (
            <Loader2 className="w-4 h-4 animate-spin" />
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1" onClick={(e) => e.stopPropagation()}>
        {participants?.map((participant) => (
          <div
            key={participant.id}
            onClick={selectParticipant(participant)}
            className={`flex items-center justify-between p-2 rounded-md cursor-pointer transition-colors group ${
              (participantInput.length > 0 && selectedText && participant.name.toLowerCase().startsWith(participantInput.toLowerCase())
                ? "bg-primary/10 border-primary/20"
                : "border-transparent") + 
              (participant.id === selectedParticipant?.id ? " bg-primary/10 border border-primary text-primary" : " hover:bg-surface border")
            }`}
          >
            <span className="text-sm font-medium">{participant.name}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {action === "Create to rename" && !selectedParticipant && !loading && (
                <button
                  onClick={mergeSpeaker(selectedText, participant)}
                  className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-surface-high rounded hover:bg-primary hover:text-white transition-colors"
                >
                  Merge
                </button>
              )}
              {selectedTextIsTimeSlice(selectedText) && !loading && (
                <button
                  onClick={assignTo(participant)}
                  className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-surface-high rounded hover:bg-primary hover:text-white transition-colors"
                >
                  Assign
                </button>
              )}
              <button
                onClick={deleteParticipant(participant.id)}
                className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-red-500/10 text-red-600 rounded hover:bg-red-500 hover:text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
