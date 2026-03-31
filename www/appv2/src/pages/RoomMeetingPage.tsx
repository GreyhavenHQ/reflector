import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useRoomGetByName, useRoomsCreateMeeting, useRoomGetMeeting } from '../lib/apiHooks';
import { useAuth } from '../lib/AuthProvider';
import { useError } from '../lib/errorContext';
import { printApiError } from '../api/_error';
import { assertMeetingId } from '../lib/types';
import MeetingSelection from '../components/rooms/MeetingSelection';
import useRoomDefaultMeeting from '../hooks/rooms/useRoomDefaultMeeting';
import WherebyRoom from '../components/rooms/WherebyRoom';
import DailyRoom from '../components/rooms/DailyRoom';

function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center h-screen bg-surface">
      <Loader2 className="w-10 h-10 text-primary animate-spin" />
    </div>
  );
}

export default function RoomMeetingPage() {
  const { roomName, meetingId: pageMeetingId } = useParams<{ roomName: string; meetingId?: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const status = auth.status;
  const isAuthenticated = status === 'authenticated';
  const { setError } = useError();

  if (!roomName) {
    return <div className="p-8 text-red-500">Missing Room Parameter</div>;
  }

  const roomQuery = useRoomGetByName(roomName);
  const createMeetingMutation = useRoomsCreateMeeting();

  const room = roomQuery.data;

  const defaultMeeting = useRoomDefaultMeeting(room && !room.ics_enabled && !pageMeetingId ? roomName : null);
  
  const explicitMeeting = useRoomGetMeeting(
    roomName,
    pageMeetingId ? assertMeetingId(pageMeetingId) : null
  );

  const meeting = explicitMeeting.data || defaultMeeting.response;

  const isLoading =
    status === 'loading' ||
    roomQuery.isLoading ||
    defaultMeeting?.loading ||
    explicitMeeting.isLoading ||
    createMeetingMutation.isPending;

  const errors = [
    explicitMeeting.error,
    defaultMeeting.error,
    roomQuery.error,
    createMeetingMutation.error,
  ].filter(Boolean);

  const isOwner = auth.status === 'authenticated' && room ? auth.user.id === room.user_id : false;

  const handleMeetingSelect = (selectedMeeting: any) => {
    navigate(`/rooms/${roomName}/${selectedMeeting.id}`);
  };

  const handleCreateUnscheduled = async () => {
    try {
      const newMeeting = await createMeetingMutation.mutateAsync({
        params: { path: { room_name: roomName } },
        body: { allow_duplicated: room ? room.ics_enabled : false },
      });
      handleMeetingSelect(newMeeting);
    } catch (err) {
      console.error('Failed to create meeting:', err);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!room && !isLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-surface">
        <p className="text-xl font-serif text-muted">Room not found or unauthorized.</p>
      </div>
    );
  }

  if (room?.ics_enabled && !pageMeetingId) {
    return (
      <MeetingSelection
        roomName={roomName}
        isOwner={isOwner}
        isSharedRoom={room?.is_shared || false}
        authLoading={['loading', 'refreshing'].includes(auth.status)}
        onMeetingSelect={handleMeetingSelect}
        onCreateUnscheduled={handleCreateUnscheduled}
        isCreatingMeeting={createMeetingMutation.isPending}
      />
    );
  }

  if (errors.length > 0) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-surface gap-2">
        {errors.map((error, i) => (
          <p key={i} className="text-red-500 font-semibold bg-red-50 p-4 rounded-md border border-red-200">
            {printApiError(error)}
          </p>
        ))}
      </div>
    );
  }

  if (!meeting) {
    return <LoadingSpinner />;
  }

  const platform = meeting.platform;

  if (!platform) {
    return (
      <div className="flex justify-center items-center h-screen bg-surface">
        <p className="text-lg font-medium text-muted">Meeting platform not configured properly.</p>
      </div>
    );
  }

  switch (platform) {
    case 'daily':
      return <DailyRoom meeting={meeting} room={room} />;
    case 'whereby':
      return <WherebyRoom meeting={meeting} room={room} />;
    default: {
      return (
        <div className="flex justify-center items-center h-screen bg-surface">
          <p className="text-lg text-red-500">Unknown platform: {platform}</p>
        </div>
      );
    }
  }
}
