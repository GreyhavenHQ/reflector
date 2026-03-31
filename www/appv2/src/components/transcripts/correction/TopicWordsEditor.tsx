import { Dispatch, SetStateAction, useEffect } from "react";
import { TimeSlice, selectedTextIsTimeSlice } from "./types";
import { useTranscriptTopicsWithWordsPerSpeaker } from "../../../lib/apiHooks";
import { Loader2 } from "lucide-react";

type TopicWordsEditorProps = {
  transcriptId: string;
  topicId: string;
  stateSelectedText: [
    number | TimeSlice | undefined,
    Dispatch<SetStateAction<number | TimeSlice | undefined>>,
  ];
  participants: any[]; // List of resolved participants
};

export function TopicWordsEditor({
  transcriptId,
  topicId,
  stateSelectedText,
  participants,
}: TopicWordsEditorProps) {
  const [selectedText, setSelectedText] = stateSelectedText;
  
  const { data: topicWithWords, isLoading } = useTranscriptTopicsWithWordsPerSpeaker(
    transcriptId as any,
    topicId,
  );

  useEffect(() => {
    if (isLoading && selectedTextIsTimeSlice(selectedText)) {
      setSelectedText(undefined);
    }
  }, [isLoading]);

  const getStartTimeFromFirstNode = (node: any, offset: number, reverse: boolean) => {
    if (node.parentElement?.dataset["start"]) {
      if (node.textContent?.length === offset) {
        const nextWordStartTime = node.parentElement.nextElementSibling?.dataset["start"];
        if (nextWordStartTime) return nextWordStartTime;
        const nextParaFirstWordStartTime = node.parentElement.parentElement.nextElementSibling?.childNodes[1]?.dataset["start"];
        if (nextParaFirstWordStartTime) return nextParaFirstWordStartTime;
        return reverse ? 0 : 9999999999999;
      } else {
        return node.parentElement.dataset["start"];
      }
    } else {
      return node.parentElement.nextElementSibling?.dataset["start"];
    }
  };

  const onMouseUp = () => {
    const selection = window.getSelection();
    if (
      selection &&
      selection.anchorNode &&
      selection.focusNode &&
      selection.anchorNode === selection.focusNode &&
      selection.anchorOffset === selection.focusOffset
    ) {
      setSelectedText(undefined);
      selection.empty();
      return;
    }
    if (
      selection &&
      selection.anchorNode &&
      selection.focusNode &&
      (selection.anchorNode !== selection.focusNode ||
        selection.anchorOffset !== selection.focusOffset)
    ) {
      const anchorNode = selection.anchorNode;
      const anchorIsWord = !!selection.anchorNode.parentElement?.dataset["start"];
      const focusNode = selection.focusNode;
      const focusIsWord = !!selection.focusNode.parentElement?.dataset["end"];

      // If selected a speaker:
      if (!anchorIsWord && !focusIsWord && anchorNode.parentElement === focusNode.parentElement) {
        const speaker = focusNode.parentElement?.dataset["speaker"];
        setSelectedText(speaker ? parseInt(speaker, 10) : undefined);
        return;
      }

      const anchorStart = getStartTimeFromFirstNode(anchorNode, selection.anchorOffset, false);
      const focusEnd =
        selection.focusOffset !== 0
          ? selection.focusNode.parentElement?.dataset["end"] ||
            (selection.focusNode.parentElement?.parentElement?.previousElementSibling?.lastElementChild as any)?.dataset["end"]
          : (selection.focusNode.parentElement?.previousElementSibling as any)?.dataset["end"] || 0;

      const reverse = parseFloat(anchorStart) >= parseFloat(focusEnd);

      if (!reverse) {
        if (anchorStart && focusEnd) {
          setSelectedText({
            start: parseFloat(anchorStart),
            end: parseFloat(focusEnd),
          });
        }
      } else {
        const anchorEnd =
          anchorNode.parentElement?.dataset["end"] ||
          (selection.anchorNode.parentElement?.parentElement?.previousElementSibling?.lastElementChild as any)?.dataset["end"];
        const focusStart = getStartTimeFromFirstNode(focusNode, selection.focusOffset, true);
        setSelectedText({
          start: parseFloat(focusStart),
          end: parseFloat(anchorEnd),
        });
      }
    }
    selection && selection.empty();
  };

  const getSpeakerName = (speakerNumber: number) => {
    if (!participants) return `Speaker ${speakerNumber}`;
    return (
      participants.find((p: any) => p.speaker === speakerNumber)?.name ||
      `Speaker ${speakerNumber}`
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
      </div>
    );
  }

  if (topicWithWords && participants) {
    return (
      <div
        onMouseUp={onMouseUp}
        className="max-h-full w-full overflow-y-auto pr-4 text-[0.9375rem] leading-relaxed selection:bg-primary/20"
      >
        {topicWithWords.words_per_speaker?.map((speakerWithWords: any, index: number) => (
          <p key={index} className="mb-4 last:mb-0">
            <span
              data-speaker={speakerWithWords.speaker}
              className={`font-semibold mr-2 cursor-pointer transition-colors ${
                selectedText === speakerWithWords.speaker ? "bg-amber-200 text-amber-900 rounded px-1" : "text-on-surface hover:text-primary"
              }`}
            >
              {getSpeakerName(speakerWithWords.speaker)}:
            </span>
            {speakerWithWords.words.map((word: any, wIndex: number) => {
              const isActive =
                selectedTextIsTimeSlice(selectedText) &&
                selectedText.start <= word.start &&
                selectedText.end >= word.end;
              return (
                <span
                  data-start={word.start}
                  data-end={word.end}
                  key={wIndex}
                  className={`transition-colors cursor-text ${
                    isActive ? "bg-amber-200 text-amber-900 rounded px-0.5" : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {word.text}{" "}
                </span>
              );
            })}
          </p>
        ))}
      </div>
    );
  }

  return null;
}
