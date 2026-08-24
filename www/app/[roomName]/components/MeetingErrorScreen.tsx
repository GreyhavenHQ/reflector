"use client";

import { Box, Button, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { useRouter } from "next/navigation";
import React from "react";
import { FaExclamationTriangle } from "react-icons/fa";

interface MeetingErrorScreenProps {
  title: string;
  message: string;
  /** Room to go back to, so the user can pick another meeting. */
  roomName?: string;
  onRetry?: () => void;
}

export default function MeetingErrorScreen({
  title,
  message,
  roomName,
  onRetry,
}: MeetingErrorScreenProps) {
  const router = useRouter();

  return (
    <Flex
      width="100vw"
      height="100vh"
      align="center"
      justify="center"
      bg="gray.50"
      p={4}
    >
      <Box
        width="100%"
        maxW="480px"
        bg="white"
        borderRadius="xl"
        boxShadow="md"
        p={{ base: 6, md: 8 }}
      >
        <VStack gap={4} align="center" textAlign="center">
          <Icon as={FaExclamationTriangle} boxSize="40px" color="orange.400" />
          <Text fontSize="xl" fontWeight="semibold">
            {title}
          </Text>
          <Text color="gray.600" whiteSpace="pre-line">
            {message}
          </Text>
          <VStack gap={2} width="100%" pt={2}>
            {onRetry && (
              <Button width="100%" colorPalette="blue" onClick={onRetry}>
                Try again
              </Button>
            )}
            {roomName && (
              <Button
                width="100%"
                variant="outline"
                onClick={() => router.push(`/${roomName}`)}
              >
                Back to meetings
              </Button>
            )}
            <Button
              width="100%"
              variant="ghost"
              onClick={() => router.push("/browse")}
            >
              Go home
            </Button>
          </VStack>
        </VStack>
      </Box>
    </Flex>
  );
}
