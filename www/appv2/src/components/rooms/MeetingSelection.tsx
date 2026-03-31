import React from 'react';
import { partition } from 'remeda';
import { useNavigate } from 'react-router-dom';
import type { components } from '../../lib/reflector-api';
import {
  useRoomActiveMeetings,
  useRoomJoinMeeting,
  useMeetingDeactivate,
  useRoomGetByName,
} from '../../lib/apiHooks';
import MeetingMinimalHeader from './MeetingMinimalHeader';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Users, Clock, Calendar, X as XIcon, Loader2 } from 'lucide-react';
import { formatDateTime, formatStartedAgo } from '../../lib/timeUtils';

type Meeting = components['schemas']['Meeting'];
type MeetingId = string;

interface MeetingSelectionProps {
  roomName: string;
  isOwner: boolean;
  isSharedRoom: boolean;
  authLoading: boolean;
  onMeetingSelect: (meeting: Meeting) => void;
  onCreateUnscheduled: () => void;
  isCreatingMeeting?: boolean;
}

export default function MeetingSelection({
  roomName,
  isOwner,
  isSharedRoom,
  onMeetingSelect,
  onCreateUnscheduled,
  isCreatingMeeting = false,
}: MeetingSelectionProps) {
  const navigate = useNavigate();
  const roomQuery = useRoomGetByName(roomName);
  const activeMeetingsQuery = useRoomActiveMeetings(roomName);
  const joinMeetingMutation = useRoomJoinMeeting();
  const deactivateMeetingMutation = useMeetingDeactivate();

  const room = roomQuery.data;
  const allMeetings = activeMeetingsQuery.data || [];

  const now = new Date();
  const [currentMeetings, nonCurrentMeetings] = partition(
    allMeetings,
    (meeting) => {
      const startTime = new Date(meeting.start_date);
      const endTime = new Date(meeting.end_date);
      return now >= startTime && now <= endTime;
    }
  );

  const upcomingMeetings = nonCurrentMeetings.filter((meeting) => {
    const startTime = new Date(meeting.start_date);
    return now < startTime;
  });

  const loading = roomQuery.isLoading || activeMeetingsQuery.isLoading;
  const error = roomQuery.error || activeMeetingsQuery.error;

  const handleJoinUpcoming = async (meeting: Meeting) => {
    try {
      const joinedMeeting = await joinMeetingMutation.mutateAsync({
        params: {
          path: {
            room_name: roomName,
            meeting_id: meeting.id,
          },
        },
      });
      onMeetingSelect(joinedMeeting);
    } catch (err) {
      console.error('Failed to join upcoming meeting:', err);
    }
  };

  const handleJoinDirect = (meeting: Meeting) => {
    onMeetingSelect(meeting);
  };

  const [meetingIdToEnd, setMeetingIdToEnd] = React.useState<MeetingId | null>(null);

  const handleEndMeeting = async (meetingId: MeetingId) => {
    try {
      await deactivateMeetingMutation.mutateAsync({
        params: {
          path: {
            meeting_id: meetingId,
          },
        },
      });
      setMeetingIdToEnd(null);
    } catch (err) {
      console.error('Failed to end meeting:', err);
    }
  };

  const handleLeaveMeeting = () => {
    navigate('/rooms');
  };

  if (loading) {
    return (
      <div className="p-8 text-center flex flex-col justify-center items-center h-screen bg-surface">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="font-serif italic text-muted">Retrieving meetings...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-md bg-red-50 border-l-4 border-red-400 max-w-lg mx-auto mt-20">
        <p className="font-semibold text-red-800">Error</p>
        <p className="text-red-700">Failed to load meetings</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen relative bg-surface selection:bg-primary-fixed">
      {isCreatingMeeting && (
        <div className="fixed inset-0 bg-[#1b1c14]/45 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-white p-8 rounded-xl shadow-xl flex flex-col gap-4 items-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-lg font-medium text-on-surface">Creating meeting...</p>
          </div>
        </div>
      )}

      <MeetingMinimalHeader
        roomName={roomName}
        displayName={room?.name}
        showLeaveButton={true}
        onLeave={handleLeaveMeeting}
        showCreateButton={isOwner || isSharedRoom}
        onCreateMeeting={onCreateUnscheduled}
        isCreatingMeeting={isCreatingMeeting}
      />

      <div className="flex flex-col w-full max-w-4xl mx-auto px-4 py-8 md:py-12 flex-1 gap-6 md:gap-8">
        {/* Current Ongoing Meetings */}
        {currentMeetings.length > 0 ? (
          <div className="flex flex-col gap-6 mb-8">
            {currentMeetings.map((meeting) => (
              <Card key={meeting.id} className="w-full bg-surface-low p-6 md:p-8 rounded-xl">
                <div className="flex flex-col md:flex-row justify-between items-stretch md:items-start gap-6">
                  <div className="flex flex-col items-start gap-4 flex-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-6 h-6 text-primary" />
                      <h2 className="text-xl md:text-2xl font-bold font-serif text-on-surface">
                        {(meeting.calendar_metadata as any)?.title || 'Live Meeting'}
                      </h2>
                    </div>

                    {isOwner && (meeting.calendar_metadata as any)?.description && (
                      <p className="text-md md:text-lg text-on-surface-variant font-sans">
                        {(meeting.calendar_metadata as any).description}
                      </p>
                    )}

                    <div className="flex gap-4 md:gap-8 text-sm md:text-base text-muted flex-wrap font-sans">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" />
                        <span className="font-medium">
                          {meeting.num_clients || 0} participant{meeting.num_clients !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>Started {formatStartedAgo(new Date(meeting.start_date))}</span>
                      </div>
                    </div>

                    {isOwner && (meeting.calendar_metadata as any)?.attendees && (
                      <div className="flex gap-2 flex-wrap mt-2">
                        {(meeting.calendar_metadata as any).attendees.slice(0, 4).map((att: any, idx: number) => (
                          <span key={idx} className="bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full font-semibold">
                            {att.name || att.email}
                          </span>
                        ))}
                        {(meeting.calendar_metadata as any).attendees.length > 4 && (
                          <span className="bg-surface-high text-muted text-xs px-2.5 py-1 rounded-full font-semibold">
                            + {(meeting.calendar_metadata as any).attendees.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 w-full md:w-auto mt-4 md:mt-0">
                    <Button
                      variant="primary"
                      className="py-3 px-6 text-base"
                      onClick={() => handleJoinDirect(meeting)}
                    >
                      <Users className="w-5 h-5 mr-2" />
                      Join Now
                    </Button>
                    {isOwner && (
                      <Button
                        variant="secondary"
                        className="py-2.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                        onClick={() => setMeetingIdToEnd(meeting.id as string)}
                        disabled={deactivateMeetingMutation.isPending}
                      >
                        {deactivateMeetingMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XIcon className="w-4 h-4 mr-2" />}
                        End Meeting
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : upcomingMeetings.length > 0 ? (
          /* Upcoming Meetings - Big Display */
          <div className="flex flex-col gap-6 mb-8">
            <h3 className="text-xl font-bold font-serif text-on-surface">
              Upcoming Meeting{upcomingMeetings.length > 1 ? 's' : ''}
            </h3>
            {upcomingMeetings.map((meeting) => {
              const now = new Date();
              const startTime = new Date(meeting.start_date);
              const minutesUntilStart = Math.floor((startTime.getTime() - now.getTime()) / (1000 * 60));

              return (
                <Card key={meeting.id} className="w-full bg-[#E5ECE5]/40 border-primary/20 p-6 md:p-8 rounded-xl">
                  <div className="flex flex-col md:flex-row justify-between items-stretch md:items-start gap-6">
                    <div className="flex flex-col items-start gap-4 flex-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-primary" />
                        <h2 className="text-xl md:text-2xl font-bold font-serif text-primary">
                          {(meeting.calendar_metadata as any)?.title || 'Upcoming Meeting'}
                        </h2>
                      </div>

                      {isOwner && (meeting.calendar_metadata as any)?.description && (
                        <p className="text-md md:text-lg text-on-surface-variant">
                          {(meeting.calendar_metadata as any).description}
                        </p>
                      )}

                      <div className="flex gap-4 md:gap-6 text-sm md:text-base text-muted flex-wrap items-center">
                        <span className="bg-primary/10 text-primary font-semibold text-sm px-3 py-1 rounded-full">
                          Starts in {minutesUntilStart} minute{minutesUntilStart !== 1 ? 's' : ''}
                        </span>
                        <span className="text-muted font-sans">
                          {formatDateTime(new Date(meeting.start_date))}
                        </span>
                      </div>

                      {isOwner && (meeting.calendar_metadata as any)?.attendees && (
                        <div className="flex gap-2 flex-wrap">
                          {(meeting.calendar_metadata as any).attendees.slice(0, 4).map((att: any, idx: number) => (
                            <span key={idx} className="bg-white/50 border border-primary/10 text-primary text-xs px-2.5 py-1 rounded-full font-semibold">
                              {att.name || att.email}
                            </span>
                          ))}
                          {(meeting.calendar_metadata as any).attendees.length > 4 && (
                            <span className="bg-surface-high text-muted text-xs px-2.5 py-1 rounded-full font-semibold">
                              + {(meeting.calendar_metadata as any).attendees.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 w-full md:w-auto mt-4 md:mt-0">
                      <Button
                        variant="primary"
                        onClick={() => handleJoinUpcoming(meeting)}
                        className="bg-primary hover:bg-primary-hover shadow-sm"
                      >
                        <Clock className="w-4 h-4 mr-2" />
                        Join Early
                      </Button>
                      {isOwner && (
                        <Button
                          variant="secondary"
                          onClick={() => setMeetingIdToEnd(meeting.id as string)}
                          disabled={deactivateMeetingMutation.isPending}
                          className="border-surface-highest text-muted hover:text-red-600 hover:border-red-200"
                        >
                          Cancel Meeting
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}

        {/* Small Upcoming Display if Ongoing EXISTS */}
        {currentMeetings.length > 0 && upcomingMeetings.length > 0 && (
          <div className="flex flex-col gap-4 mb-6 pt-4 border-t border-surface-high">
            <h3 className="text-lg font-semibold font-serif text-on-surface-variant">Starting Soon</h3>
            <div className="flex gap-4 flex-wrap flex-col sm:flex-row">
              {upcomingMeetings.map((meeting) => {
                const now = new Date();
                const startTime = new Date(meeting.start_date);
                const minutesUntilStart = Math.floor((startTime.getTime() - now.getTime()) / (1000 * 60));

                return (
                  <div key={meeting.id} className="bg-surface border border-primary/20 rounded-lg p-5 min-w-[280px] hover:border-primary/40 transition-colors">
                    <div className="flex flex-col items-start gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-md text-on-surface">
                          {(meeting.calendar_metadata as any)?.title || 'Upcoming'}
                        </span>
                      </div>
                      <span className="bg-primary/10 text-primary font-semibold text-xs px-2 py-1 rounded-md">
                        in {minutesUntilStart} minute{minutesUntilStart !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-muted font-sans">
                        Starts: {formatDateTime(new Date(meeting.start_date))}
                      </span>
                      <Button variant="primary" className="w-full mt-1 text-sm py-1.5" onClick={() => handleJoinUpcoming(meeting)}>
                        Join Early
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No Meetings Fallback */}
        {currentMeetings.length === 0 && upcomingMeetings.length === 0 && (
          <div className="flex flex-col w-full flex-1 justify-center items-center text-center pb-20 mt-10">
            <div className="w-20 h-20 rounded-full bg-surface-high flex items-center justify-center mb-6">
              <Calendar className="w-10 h-10 text-on-surface-variant opacity-40" />
            </div>
            <h2 className="text-2xl font-semibold font-serif text-on-surface mb-2">No meetings active</h2>
            <p className="text-muted max-w-sm font-sans text-[0.9375rem] leading-relaxed">
              There are no ongoing or upcoming calendar meetings parsed for this room currently.
            </p>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={meetingIdToEnd !== null}
        onClose={() => setMeetingIdToEnd(null)}
        onConfirm={() => meetingIdToEnd && handleEndMeeting(meetingIdToEnd)}
        title="End Meeting"
        description="Are you sure you want to end this calendar event's recording context? This will deactivate the session for all participants and cannot be undone."
        confirmText="End Meeting"
        isDestructive={true}
        isLoading={deactivateMeetingMutation.isPending}
      />
    </div>
  );
}
