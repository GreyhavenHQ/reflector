import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import DailyIframe, {
  DailyCall,
  DailyCallOptions,
  DailyCustomTrayButton,
  DailyCustomTrayButtons,
  DailyEventObjectCustomButtonClick,
  DailyFactoryOptions,
  DailyParticipantsObject,
} from '@daily-co/daily-js';
import type { components } from '../../lib/reflector-api';
import { useAuth } from '../../lib/AuthProvider';
import { useConsentDialog } from '../../lib/consent';
import { featureEnabled } from '../../lib/features';
import { useRoomJoinMeeting, useMeetingStartRecording } from '../../lib/apiHooks';
import { omit } from 'remeda';
import { NonEmptyString } from '../../lib/utils';
import { assertMeetingId, DailyRecordingType } from '../../lib/types';
import { v5 as uuidv5 } from 'uuid';

const CONSENT_BUTTON_ID = 'recording-consent';
const RECORDING_INDICATOR_ID = 'recording-indicator';
const RAW_TRACKS_NAMESPACE = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const RECORDING_START_DELAY_MS = 2000;
const RECORDING_START_MAX_RETRIES = 5;

type Meeting = components['schemas']['Meeting'];
type Room = components['schemas']['RoomDetails'];
type MeetingId = string;

type DailyRoomProps = {
  meeting: Meeting;
  room: Room;
};

const useCustomTrayButtons = (
  frame: { updateCustomTrayButtons: (buttons: DailyCustomTrayButtons) => void; joined: boolean } | null
) => {
  const [, setCustomTrayButtons] = useState<DailyCustomTrayButtons>({});
  return useCallback(
    (id: string, button: DailyCustomTrayButton | null) => {
      setCustomTrayButtons((prev) => {
        const state = button === null ? omit(prev, [id]) : { ...prev, [id]: button };
        if (frame !== null && frame.joined) frame.updateCustomTrayButtons(state);
        return state;
      });
    },
    [frame]
  );
};

const USE_FRAME_INIT_STATE = { frame: null as DailyCall | null, joined: false as boolean } as const;

const useFrame = (
  container: HTMLDivElement | null,
  cbs: {
    onLeftMeeting: () => void;
    onCustomButtonClick: (ev: DailyEventObjectCustomButtonClick) => void;
    onJoinMeeting: () => void;
  }
) => {
  const [{ frame, joined }, setState] = useState(USE_FRAME_INIT_STATE);

  const setJoined = useCallback((j: boolean) => setState((prev) => ({ ...prev, joined: j })), [setState]);
  const setFrame = useCallback((f: DailyCall | null) => setState((prev) => ({ ...prev, frame: f })), [setState]);

  useEffect(() => {
    if (!container) return;
    let isActive = true;

    const init = async () => {
      const existingFrame = DailyIframe.getCallInstance();
      if (existingFrame) {
        await existingFrame.destroy();
      }
      if (!isActive) return;

      const frameOptions: DailyFactoryOptions = {
        iframeStyle: {
          width: '100vw',
          height: '100vh',
          border: 'none',
        },
        showLeaveButton: true,
        showFullscreenButton: true,
      };
      
      const newFrame = DailyIframe.createFrame(container, frameOptions);
      setFrame(newFrame);
    };
    
    init().catch(console.error);
    return () => {
      isActive = false;
      frame?.destroy().catch(console.error);
      setState(USE_FRAME_INIT_STATE);
    };
  }, [container]);

  useEffect(() => {
    if (!frame) return;
    frame.on('left-meeting', cbs.onLeftMeeting);
    frame.on('custom-button-click', cbs.onCustomButtonClick);
    
    const joinCb = () => {
      if (!frame) return;
      cbs.onJoinMeeting();
    };
    
    frame.on('joined-meeting', joinCb);
    return () => {
      frame.off('left-meeting', cbs.onLeftMeeting);
      frame.off('custom-button-click', cbs.onCustomButtonClick);
      frame.off('joined-meeting', joinCb);
    };
  }, [frame, cbs]);

  const frame_ = useMemo(() => {
    if (frame === null) return frame;
    return {
      join: async (properties?: DailyCallOptions): Promise<DailyParticipantsObject | void> => {
        await frame.join(properties);
        setJoined(!frame.isDestroyed());
      },
      updateCustomTrayButtons: (buttons: DailyCustomTrayButtons): DailyCall => frame.updateCustomTrayButtons(buttons),
    };
  }, [frame, setJoined]);

  const setCustomTrayButton = useCustomTrayButtons(
    useMemo(() => (frame_ === null ? null : { updateCustomTrayButtons: frame_.updateCustomTrayButtons, joined }), [
      frame_,
      joined,
    ])
  );

  return [frame_, { setCustomTrayButton }] as const;
};

export default function DailyRoom({ meeting, room }: DailyRoomProps) {
  const navigate = useNavigate();
  const { roomName } = useParams();
  const auth = useAuth();
  const authLastUserId = auth.status === 'authenticated' ? auth.user.id : undefined;
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  
  const joinMutation = useRoomJoinMeeting();
  const startRecordingMutation = useMeetingStartRecording();
  const [joinedMeeting, setJoinedMeeting] = useState<Meeting | null>(null);

  const cloudInstanceId = meeting.id;
  const rawTracksInstanceId = uuidv5(meeting.id, RAW_TRACKS_NAMESPACE);

  const { showConsentModal, showRecordingIndicator, showConsentButton } = useConsentDialog({
    meetingId: assertMeetingId(meeting.id),
    recordingType: meeting.recording_type,
    skipConsent: room.skip_consent,
  });

  const showConsentModalRef = useRef(showConsentModal);
  showConsentModalRef.current = showConsentModal;

  useEffect(() => {
    if (authLastUserId === undefined || !meeting?.id || !roomName) return;

    let isMounted = true;
    const join = async () => {
      try {
        const result = await joinMutation.mutateAsync({
          params: { path: { room_name: roomName, meeting_id: meeting.id } },
        });
        if (isMounted) setJoinedMeeting(result);
      } catch (error) {
        console.error('Failed to join meeting:', error);
      }
    };
    join().catch(console.error);
    return () => { isMounted = false; };
  }, [meeting?.id, roomName, authLastUserId]);

  const roomUrl = joinedMeeting?.room_url;

  const handleLeave = useCallback(() => {
    navigate('/transcriptions');
  }, [navigate]);

  const handleCustomButtonClick = useCallback((ev: DailyEventObjectCustomButtonClick) => {
    if (ev.button_id === CONSENT_BUTTON_ID) {
      showConsentModalRef.current();
    }
  }, []);

  const handleFrameJoinMeeting = useCallback(() => {
    if (meeting.recording_type === 'cloud') {
      const startRecordingWithRetry = (type: DailyRecordingType, instanceId: string, attempt: number = 1) => {
        setTimeout(() => {
          startRecordingMutation.mutate(
            {
              params: { path: { meeting_id: meeting.id as any } },
              body: { type: type as any, instanceId }
            },
            {
              onError: (error: any) => {
                const errorText = error?.detail || error?.message || '';
                const is404NotHosting = errorText.includes('does not seem to be hosting a call');
                const isActiveStream = errorText.includes('has an active stream');

                if (is404NotHosting && attempt < RECORDING_START_MAX_RETRIES) {
                  startRecordingWithRetry(type, instanceId, attempt + 1);
                } else if (!isActiveStream) {
                  console.error(`Failed to start ${type} recording:`, error);
                }
              },
            }
          );
        }, RECORDING_START_DELAY_MS);
      };

      startRecordingWithRetry('cloud', cloudInstanceId);
      startRecordingWithRetry('raw-tracks', rawTracksInstanceId);
    }
  }, [meeting.recording_type, meeting.id, cloudInstanceId, rawTracksInstanceId, startRecordingMutation]);

  const recordingIconUrl = useMemo(() => new URL('/recording-icon.svg', window.location.origin), []);

  const [frame, { setCustomTrayButton }] = useFrame(container, {
    onLeftMeeting: handleLeave,
    onCustomButtonClick: handleCustomButtonClick,
    onJoinMeeting: handleFrameJoinMeeting,
  });

  useEffect(() => {
    if (!frame || !roomUrl) return;
    frame.join({
      url: roomUrl,
      sendSettings: {
        video: { allowAdaptiveLayers: true, maxQuality: 'medium' },
      },
    }).catch(console.error);
  }, [frame, roomUrl]);

  useEffect(() => {
    setCustomTrayButton(
      RECORDING_INDICATOR_ID,
      showRecordingIndicator
        ? { iconPath: recordingIconUrl.href, label: 'Recording', tooltip: 'Recording in progress' }
        : null
    );
  }, [showRecordingIndicator, recordingIconUrl, setCustomTrayButton]);

  useEffect(() => {
    setCustomTrayButton(
      CONSENT_BUTTON_ID,
      showConsentButton
        ? { iconPath: recordingIconUrl.href, label: 'Recording (click to consent)', tooltip: 'Recording (click to consent)' }
        : null
    );
  }, [showConsentButton, recordingIconUrl, setCustomTrayButton]);

  if (authLastUserId === undefined || joinMutation.isPending) {
    return (
      <div className="w-screen h-screen flex justify-center items-center bg-surface">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (joinMutation.isError) {
    return (
      <div className="w-screen h-screen flex justify-center items-center bg-surface">
        <p className="text-red-500 font-medium">Failed to join meeting. Please try again.</p>
      </div>
    );
  }

  if (!roomUrl) return null;

  return (
    <div className="relative w-screen h-screen">
      <div ref={setContainer} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
