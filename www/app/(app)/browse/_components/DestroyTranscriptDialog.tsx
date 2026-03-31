import React from "react";
import { Button, Dialog, Text } from "@chakra-ui/react";

interface DestroyTranscriptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  cancelRef: React.RefObject<any>;
  isLoading?: boolean;
  title?: string;
  date?: string;
  source?: string;
}

export default function DestroyTranscriptDialog({
  isOpen,
  onClose,
  onConfirm,
  cancelRef,
  isLoading,
  title,
  date,
  source,
}: DestroyTranscriptDialogProps) {
  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      initialFocusEl={() => cancelRef.current}
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header fontSize="lg" fontWeight="bold">
            Permanently Destroy Transcript
          </Dialog.Header>
          <Dialog.Body>
            <Text color="red.600" fontWeight="medium">
              This will permanently delete this transcript and all its
              associated audio files. This action cannot be undone.
            </Text>
            {title && (
              <Text mt={3} fontWeight="600">
                {title}
              </Text>
            )}
            {date && (
              <Text color="gray.600" fontSize="sm">
                Date: {date}
              </Text>
            )}
            {source && (
              <Text color="gray.600" fontSize="sm">
                Source: {source}
              </Text>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            <Button
              ref={cancelRef as any}
              onClick={onClose}
              disabled={!!isLoading}
              variant="outline"
              colorPalette="gray"
            >
              Cancel
            </Button>
            <Button
              colorPalette="red"
              onClick={onConfirm}
              ml={3}
              disabled={!!isLoading}
            >
              Destroy
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
