/**
 * useConsentDialog — ported from Next.js, adapted for Tailwind-based UI.
 *
 * Shows consent dialog as a modal overlay instead of Chakra toast.
 */

import { useCallback, useState } from "react";
import { useRecordingConsent } from "../recordingConsentContext";
import { useMeetingAudioConsent } from "../apiHooks";
import { recordingTypeRequiresConsent } from "./utils";
import type { ConsentDialogResult } from "./types";
import { MeetingId } from "../types";
import type { components } from "../reflector-api";

type Meeting = components["schemas"]["Meeting"];

type UseConsentDialogParams = {
  meetingId: MeetingId;
  recordingType: Meeting["recording_type"];
  skipConsent: boolean;
};

export function useConsentDialog({
  meetingId,
  recordingType,
  skipConsent,
}: UseConsentDialogParams): ConsentDialogResult {
  const {
    state: consentState,
    touch,
    hasAnswered,
    hasAccepted,
  } = useRecordingConsent();
  const [modalOpen, setModalOpen] = useState(false);
  const audioConsentMutation = useMeetingAudioConsent();

  const handleConsent = useCallback(
    async (given: boolean) => {
      try {
        await audioConsentMutation.mutateAsync({
          params: {
            path: { meeting_id: meetingId },
          },
          body: {
            consent_given: given,
          },
        });

        touch(meetingId, given);
      } catch (error) {
        console.error("Error submitting consent:", error);
      }
      setModalOpen(false);
    },
    [audioConsentMutation, touch, meetingId],
  );

  const showConsentModal = useCallback(() => {
    if (modalOpen) return;
    setModalOpen(true);
  }, [modalOpen]);

  const requiresConsent = Boolean(
    recordingType && recordingTypeRequiresConsent(recordingType),
  );

  const showRecordingIndicator =
    requiresConsent && (skipConsent || hasAccepted(meetingId));

  const showConsentButton =
    requiresConsent && !skipConsent && !hasAnswered(meetingId);

  return {
    showConsentModal,
    consentState,
    hasAnswered,
    hasAccepted,
    consentLoading: audioConsentMutation.isPending,
    showRecordingIndicator,
    showConsentButton,
  };
}
