"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { Box, Text } from "@chakra-ui/react";
import { toaster } from "../../components/ui/toaster";
import { useMeetingAddEmailRecipient } from "../apiHooks";
import { EmailTranscriptDialog } from "./EmailTranscriptDialog";
import type { MeetingId } from "../types";

const TOAST_CHECK_INTERVAL_MS = 100;

type UseEmailTranscriptDialogParams = {
  meetingId: MeetingId;
};

export function useEmailTranscriptDialog({
  meetingId,
}: UseEmailTranscriptDialogParams) {
  const [modalOpen, setModalOpen] = useState(false);
  const addEmailMutation = useMeetingAddEmailRecipient();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const keydownHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (keydownHandlerRef.current) {
        document.removeEventListener("keydown", keydownHandlerRef.current);
        keydownHandlerRef.current = null;
      }
    };
  }, []);

  const handleSubmitEmail = useCallback(
    async (email: string) => {
      try {
        await addEmailMutation.mutateAsync({
          params: {
            path: { meeting_id: meetingId },
          },
          body: {
            email,
          },
        });

        toaster.create({
          duration: 4000,
          render: () => (
            <Box
              p={4}
              bg="green.100"
              borderRadius="md"
              boxShadow="md"
              textAlign="center"
            >
              <Text fontWeight="medium">Email registered</Text>
              <Text fontSize="sm" color="gray.600">
                You will receive the transcript link when processing is
                complete.
              </Text>
            </Box>
          ),
        });
      } catch (error) {
        console.error("Error adding email recipient:", error);
      }
    },
    [addEmailMutation, meetingId],
  );

  const showEmailModal = useCallback(() => {
    if (modalOpen) return;

    setModalOpen(true);

    const toastId = toaster.create({
      placement: "top",
      duration: null,
      render: ({ dismiss }) => (
        <EmailTranscriptDialog
          onSubmit={(email) => {
            handleSubmitEmail(email);
            dismiss();
          }}
          onDismiss={() => {
            dismiss();
          }}
        />
      ),
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        toastId.then((id) => toaster.dismiss(id));
      }
    };

    keydownHandlerRef.current = handleKeyDown;
    document.addEventListener("keydown", handleKeyDown);

    toastId.then((id) => {
      intervalRef.current = setInterval(() => {
        if (!toaster.isActive(id)) {
          setModalOpen(false);

          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          if (keydownHandlerRef.current) {
            document.removeEventListener("keydown", keydownHandlerRef.current);
            keydownHandlerRef.current = null;
          }
        }
      }, TOAST_CHECK_INTERVAL_MS);
    });
  }, [handleSubmitEmail, modalOpen]);

  return {
    showEmailModal,
  };
}
