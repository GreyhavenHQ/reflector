"use client";

import { useState, useEffect } from "react";
import { Box, Button, Input, Text, VStack, HStack } from "@chakra-ui/react";

interface EmailTranscriptDialogProps {
  onSubmit: (email: string) => void;
  onDismiss: () => void;
}

export function EmailTranscriptDialog({
  onSubmit,
  onDismiss,
}: EmailTranscriptDialogProps) {
  const [email, setEmail] = useState("");
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);

  useEffect(() => {
    inputEl?.focus();
  }, [inputEl]);

  const handleSubmit = () => {
    const trimmed = email.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  return (
    <Box
      p={6}
      bg="rgba(255, 255, 255, 0.7)"
      borderRadius="lg"
      boxShadow="lg"
      maxW="md"
      mx="auto"
    >
      <VStack gap={4} alignItems="center">
        <Text fontSize="md" textAlign="center" fontWeight="medium">
          Enter your email to receive the transcript when it&apos;s ready
        </Text>
        <Input
          ref={setInputEl}
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          size="sm"
          bg="white"
        />
        <HStack gap={4} justifyContent="center">
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Cancel
          </Button>
          <Button
            colorPalette="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!email.trim()}
          >
            Send
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}
