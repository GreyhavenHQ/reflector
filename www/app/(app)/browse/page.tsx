"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  Flex,
  Spinner,
  Heading,
  Text,
  Link,
  Box,
  Stack,
  Input,
  Button,
  IconButton,
} from "@chakra-ui/react";
import {
  useQueryState,
  parseAsString,
  parseAsInteger,
  parseAsStringLiteral,
} from "nuqs";
import { LuX } from "react-icons/lu";
import { toaster } from "../../components/ui/toaster";
import type { components } from "../../reflector-api";

type Room = components["schemas"]["Room"];
type SourceKind = components["schemas"]["SourceKind"];
type SearchResult = components["schemas"]["SearchResult"];
import {
  useRoomsList,
  useTranscriptsSearch,
  useTranscriptDelete,
  useTranscriptProcess,
  useTranscriptRestore,
  useTranscriptDestroy,
  useAuthReady,
} from "../../lib/apiHooks";
import FilterSidebar from "./_components/FilterSidebar";
import Pagination, {
  FIRST_PAGE,
  PaginationPage,
  parsePaginationPage,
  totalPages as getTotalPages,
  paginationPageTo0Based,
} from "./_components/Pagination";
import TranscriptCards from "./_components/TranscriptCards";
import DeleteTranscriptDialog from "./_components/DeleteTranscriptDialog";
import DestroyTranscriptDialog from "./_components/DestroyTranscriptDialog";
import { formatLocalDate } from "../../lib/time";
import { RECORD_A_MEETING_URL } from "../../api/urls";
import { useUserName } from "../../lib/useUserName";

const SEARCH_FORM_QUERY_INPUT_NAME = "query" as const;

const SearchForm: React.FC<{
  setPage: (page: PaginationPage) => void;
  sourceKind: SourceKind | null;
  roomId: string | null;
  setSourceKind: (sourceKind: SourceKind | null) => void;
  setRoomId: (roomId: string | null) => void;
  rooms: Room[];
  searchQuery: string | null;
  setSearchQuery: (query: string | null) => void;
}> = ({
  setPage,
  sourceKind,
  roomId,
  setRoomId,
  setSourceKind,
  rooms,
  searchQuery,
  setSearchQuery,
}) => {
  const [searchInputValue, setSearchInputValue] = useState(searchQuery || "");
  const handleSearchQuerySubmit = async (d: FormData) => {
    await setSearchQuery((d.get(SEARCH_FORM_QUERY_INPUT_NAME) as string) || "");
  };

  const handleClearSearch = () => {
    setSearchInputValue("");
    setSearchQuery(null);
    setPage(FIRST_PAGE);
  };
  return (
    <Stack gap={2}>
      <form action={handleSearchQuerySubmit}>
        <Flex alignItems="center">
          <Box position="relative" flex="1">
            <Input
              placeholder="Search transcriptions..."
              value={searchInputValue}
              onChange={(e) => setSearchInputValue(e.target.value)}
              name={SEARCH_FORM_QUERY_INPUT_NAME}
              pr={searchQuery ? "2.5rem" : undefined}
            />
            {searchQuery && (
              <IconButton
                aria-label="Clear search"
                size="sm"
                variant="ghost"
                onClick={handleClearSearch}
                position="absolute"
                right="0.25rem"
                top="50%"
                transform="translateY(-50%)"
                _hover={{ bg: "gray.100" }}
              >
                <LuX />
              </IconButton>
            )}
          </Box>
          <Button ml={2} type="submit">
            Search
          </Button>
        </Flex>
      </form>
      <UnderSearchFormFilterIndicators
        sourceKind={sourceKind}
        roomId={roomId}
        setSourceKind={setSourceKind}
        setRoomId={setRoomId}
        rooms={rooms}
      />
    </Stack>
  );
};

const UnderSearchFormFilterIndicators: React.FC<{
  sourceKind: SourceKind | null;
  roomId: string | null;
  setSourceKind: (sourceKind: SourceKind | null) => void;
  setRoomId: (roomId: string | null) => void;
  rooms: Room[];
}> = ({ sourceKind, roomId, setRoomId, setSourceKind, rooms }) => {
  return (
    <>
      {(sourceKind || roomId) && (
        <Flex gap={2} flexWrap="wrap" align="center">
          <Text fontSize="sm" color="gray.600">
            Active filters:
          </Text>
          {sourceKind && (
            <Flex
              align="center"
              px={2}
              py={1}
              bg="blue.100"
              borderRadius="md"
              fontSize="xs"
              gap={1}
            >
              <Text>
                {roomId
                  ? `Room: ${
                      rooms.find((r) => r.id === roomId)?.name || roomId
                    }`
                  : `Source: ${sourceKind}`}
              </Text>
              <Button
                size="xs"
                variant="ghost"
                minW="auto"
                h="auto"
                p="1px"
                onClick={() => {
                  setSourceKind(null);
                  setRoomId(null);
                }}
                _hover={{ bg: "blue.200" }}
                aria-label="Clear filter"
              >
                <LuX size={14} />
              </Button>
            </Flex>
          )}
        </Flex>
      )}
    </>
  );
};

const EmptyResult: React.FC<{
  searchQuery: string;
  isTrash?: boolean;
}> = ({ searchQuery, isTrash }) => {
  return (
    <Flex flexDir="column" alignItems="center" justifyContent="center" py={8}>
      <Text textAlign="center">
        {isTrash
          ? "Trash is empty."
          : searchQuery
            ? `No results found for "${searchQuery}". Try adjusting your search terms.`
            : "No transcripts found, but you can "}
        {!isTrash && !searchQuery && (
          <>
            <Link href={RECORD_A_MEETING_URL} color="blue.500">
              record a meeting
            </Link>
            {" to get started."}
          </>
        )}
      </Text>
    </Flex>
  );
};

export default function TranscriptBrowser() {
  const { isAuthenticated } = useAuthReady();

  const [urlSearchQuery, setUrlSearchQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ shallow: false }),
  );

  const [urlSourceKind, setUrlSourceKind] = useQueryState(
    "source",
    parseAsStringLiteral([
      "room",
      "live",
      "file",
    ] as const satisfies SourceKind[]).withOptions({
      shallow: false,
    }),
  );
  const [urlRoomId, setUrlRoomId] = useQueryState(
    "room",
    parseAsString.withDefault("").withOptions({ shallow: false }),
  );

  const [urlTrash, setUrlTrash] = useQueryState(
    "trash",
    parseAsStringLiteral(["1"] as const).withOptions({ shallow: false }),
  );
  const isTrashView = urlTrash === "1";

  const [urlPage, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  );

  const [page, _setSafePage] = useState(FIRST_PAGE);

  // safety net
  useEffect(() => {
    const maybePage = parsePaginationPage(urlPage);
    if ("error" in maybePage) {
      setPage(FIRST_PAGE).then(() => {});
      return;
    }
    _setSafePage(maybePage.value);
  }, [urlPage, setPage]);

  const pageSize = 20;

  // must be json-able
  const searchFilters = useMemo(
    () => ({
      q: urlSearchQuery,
      extras: {
        room_id: isTrashView ? undefined : urlRoomId || undefined,
        source_kind: isTrashView ? undefined : urlSourceKind || undefined,
        include_deleted: isTrashView ? true : undefined,
      },
    }),
    [urlSearchQuery, urlRoomId, urlSourceKind, isTrashView],
  );

  const {
    data: searchData,
    isLoading: searchLoading,
    refetch: reloadSearch,
  } = useTranscriptsSearch(searchFilters.q, {
    limit: pageSize,
    offset: paginationPageTo0Based(page) * pageSize,
    ...searchFilters.extras,
  });

  const results = searchData?.results || [];
  const totalResults = searchData?.total || 0;

  // Fetch rooms
  const { data: roomsData } = useRoomsList(1);
  const rooms = roomsData?.items || [];

  const totalPages = getTotalPages(totalResults, pageSize);

  // reset pagination when search filters change
  useEffect(() => {
    // operation is idempotent
    setPage(FIRST_PAGE).then(() => {});
  }, [searchFilters, setPage]);

  const userName = useUserName();
  const [actionLoading, setActionLoading] = useState(false);
  const cancelRef = React.useRef(null);
  const destroyCancelRef = React.useRef(null);

  // Delete (soft-delete / move to trash)
  const [transcriptToDeleteId, setTranscriptToDeleteId] =
    React.useState<string>();

  // Destroy (hard-delete)
  const [transcriptToDestroyId, setTranscriptToDestroyId] =
    React.useState<string>();

  const handleFilterTranscripts = (
    sourceKind: SourceKind | null,
    roomId: string,
  ) => {
    if (isTrashView) {
      setUrlTrash(null);
    }
    setUrlSourceKind(sourceKind);
    setUrlRoomId(roomId);
    setPage(1);
  };

  const handleTrashClick = () => {
    setUrlTrash(isTrashView ? null : "1");
    setUrlSourceKind(null);
    setUrlRoomId(null);
    setPage(1);
  };

  const onCloseDeletion = () => setTranscriptToDeleteId(undefined);
  const onCloseDestroy = () => setTranscriptToDestroyId(undefined);

  const deleteTranscript = useTranscriptDelete();
  const processTranscript = useTranscriptProcess();
  const restoreTranscript = useTranscriptRestore();
  const destroyTranscript = useTranscriptDestroy();

  const confirmDeleteTranscript = (transcriptId: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    deleteTranscript.mutate(
      {
        params: {
          path: { transcript_id: transcriptId },
        },
      },
      {
        onSuccess: () => {
          setActionLoading(false);
          onCloseDeletion();
          reloadSearch();
        },
        onError: () => {
          setActionLoading(false);
        },
      },
    );
  };

  const handleProcessTranscript = (transcriptId: string) => {
    processTranscript.mutate({
      params: {
        path: { transcript_id: transcriptId },
      },
    });
  };

  const handleRestoreTranscript = (transcriptId: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    restoreTranscript.mutate(
      {
        params: {
          path: { transcript_id: transcriptId },
        },
      },
      {
        onSuccess: () => {
          setActionLoading(false);
          reloadSearch();
          toaster.create({
            duration: 3000,
            render: () => (
              <Box bg="green.500" color="white" px={4} py={3} borderRadius="md">
                <Text fontWeight="bold">Transcript restored</Text>
              </Box>
            ),
          });
        },
        onError: () => {
          setActionLoading(false);
        },
      },
    );
  };

  const confirmDestroyTranscript = (transcriptId: string) => {
    if (actionLoading) return;
    setActionLoading(true);
    destroyTranscript.mutate(
      {
        params: {
          path: { transcript_id: transcriptId },
        },
      },
      {
        onSuccess: () => {
          setActionLoading(false);
          onCloseDestroy();
          reloadSearch();
        },
        onError: () => {
          setActionLoading(false);
        },
      },
    );
  };

  // Dialog data for delete
  const transcriptToDelete = results?.find(
    (i) => i.id === transcriptToDeleteId,
  );
  const deleteDialogTitle = transcriptToDelete?.title || "Unnamed Transcript";
  const deleteDialogDate = transcriptToDelete?.created_at
    ? formatLocalDate(transcriptToDelete.created_at)
    : undefined;
  const deleteDialogSource =
    transcriptToDelete?.source_kind === "room" && transcriptToDelete?.room_id
      ? transcriptToDelete.room_name || transcriptToDelete.room_id
      : transcriptToDelete?.source_kind;

  // Dialog data for destroy
  const transcriptToDestroy = results?.find(
    (i) => i.id === transcriptToDestroyId,
  );
  const destroyDialogTitle = transcriptToDestroy?.title || "Unnamed Transcript";
  const destroyDialogDate = transcriptToDestroy?.created_at
    ? formatLocalDate(transcriptToDestroy.created_at)
    : undefined;
  const destroyDialogSource =
    transcriptToDestroy?.source_kind === "room" && transcriptToDestroy?.room_id
      ? transcriptToDestroy.room_name || transcriptToDestroy.room_id
      : transcriptToDestroy?.source_kind;

  if (searchLoading && results.length === 0) {
    return (
      <Flex
        flexDir="column"
        alignItems="center"
        justifyContent="center"
        h="100%"
      >
        <Spinner size="xl" />
      </Flex>
    );
  }

  return (
    <Flex
      flexDir="column"
      w={{ base: "full", md: "container.xl" }}
      mx="auto"
      pt={4}
    >
      <Flex
        flexDir="row"
        justifyContent="space-between"
        alignItems="center"
        mb={4}
      >
        <Heading size="lg">
          {isTrashView
            ? "Trash"
            : userName
              ? `${userName}'s Transcriptions`
              : "Your Transcriptions"}{" "}
          {(searchLoading || actionLoading) && <Spinner size="sm" />}
        </Heading>
      </Flex>

      <Flex flexDir={{ base: "column", md: "row" }}>
        <FilterSidebar
          rooms={rooms}
          selectedSourceKind={isTrashView ? null : urlSourceKind}
          selectedRoomId={isTrashView ? "" : urlRoomId}
          onFilterChange={handleFilterTranscripts}
          isTrashView={isTrashView}
          onTrashClick={handleTrashClick}
          isAuthenticated={isAuthenticated}
        />

        <Flex
          flexDir="column"
          flex="1"
          pt={{ base: 4, md: 0 }}
          pb={4}
          gap={4}
          px={{ base: 0, md: 4 }}
        >
          <SearchForm
            setPage={setPage}
            sourceKind={isTrashView ? null : urlSourceKind}
            roomId={isTrashView ? null : urlRoomId}
            searchQuery={urlSearchQuery}
            setSearchQuery={setUrlSearchQuery}
            setSourceKind={setUrlSourceKind}
            setRoomId={setUrlRoomId}
            rooms={rooms}
          />

          {totalPages > 1 ? (
            <Pagination
              page={page}
              setPage={setPage}
              total={totalResults}
              size={pageSize}
            />
          ) : null}

          <TranscriptCards
            results={results}
            query={urlSearchQuery}
            isLoading={searchLoading}
            isTrash={isTrashView}
            onDelete={isTrashView ? undefined : setTranscriptToDeleteId}
            onReprocess={isTrashView ? undefined : handleProcessTranscript}
            onRestore={isTrashView ? handleRestoreTranscript : undefined}
            onDestroy={isTrashView ? setTranscriptToDestroyId : undefined}
          />

          {!searchLoading && results.length === 0 && (
            <EmptyResult searchQuery={urlSearchQuery} isTrash={isTrashView} />
          )}
        </Flex>
      </Flex>

      <DeleteTranscriptDialog
        isOpen={!!transcriptToDeleteId}
        onClose={onCloseDeletion}
        onConfirm={() =>
          transcriptToDeleteId && confirmDeleteTranscript(transcriptToDeleteId)
        }
        cancelRef={cancelRef}
        isLoading={actionLoading}
        title={deleteDialogTitle}
        date={deleteDialogDate}
        source={deleteDialogSource}
      />

      <DestroyTranscriptDialog
        isOpen={!!transcriptToDestroyId}
        onClose={onCloseDestroy}
        onConfirm={() =>
          transcriptToDestroyId &&
          confirmDestroyTranscript(transcriptToDestroyId)
        }
        cancelRef={destroyCancelRef}
        isLoading={actionLoading}
        title={destroyDialogTitle}
        date={destroyDialogDate}
        source={destroyDialogSource}
      />
    </Flex>
  );
}
