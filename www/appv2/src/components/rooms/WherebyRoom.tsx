import React, { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { components } from '../../lib/reflector-api';
import { useAuth } from '../../lib/AuthProvider';
import { getWherebyUrl, useWhereby } from '../../lib/wherebyClient';
import { assertMeetingId } from '../../lib/types';
import { ConsentDialogButton as BaseConsentDialogButton, useConsentDialog } from '../../lib/consent';

type Meeting = components['schemas']['Meeting'];
type Room = components['schemas']['RoomDetails'];
type MeetingId = string;

interface WherebyRoomProps {
  meeting: Meeting;
  room: Room;
}

function WherebyConsentDialogButton({
  onClick,
  wherebyRef,
}: {
  onClick: () => void;
  wherebyRef: React.RefObject<HTMLElement | null>;
}) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = wherebyRef.current;
    if (!element) return;

    const handleWherebyReady = () => {
      previousFocusRef.current = document.activeElement as HTMLElement;
    };

    element.addEventListener('ready', handleWherebyReady);

    return () => {
      element.removeEventListener('ready', handleWherebyReady);
      if (previousFocusRef.current && document.activeElement === element) {
        previousFocusRef.current.focus();
      }
    };
  }, [wherebyRef]);

  return (
    <BaseConsentDialogButton onClick={onClick} />
  );
}

export default function WherebyRoom({ meeting, room }: WherebyRoomProps) {
  const wherebyLoaded = useWhereby();
  const wherebyRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const auth = useAuth();
  const status = auth.status;
  const isAuthenticated = status === 'authenticated';

  const wherebyRoomUrl = getWherebyUrl(meeting);
  const meetingId = meeting.id;

  const { showConsentButton, showConsentModal } = useConsentDialog({
    meetingId: assertMeetingId(meetingId),
    recordingType: meeting.recording_type,
    skipConsent: room.skip_consent,
  });

  const showConsentModalRef = useRef(showConsentModal);
  showConsentModalRef.current = showConsentModal;

  const isLoading = status === 'loading';

  const handleLeave = useCallback(() => {
    navigate('/transcriptions');
  }, [navigate]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !wherebyRoomUrl || !wherebyLoaded) return;

    const currentRef = wherebyRef.current;
    if (currentRef) {
      currentRef.addEventListener('leave', handleLeave as EventListener);
    }

    return () => {
      if (currentRef) {
        currentRef.removeEventListener('leave', handleLeave as EventListener);
      }
    };
  }, [handleLeave, wherebyRoomUrl, isLoading, isAuthenticated, wherebyLoaded]);

  if (!wherebyRoomUrl || !wherebyLoaded) {
    return null;
  }

  // Inject Web Component tag for whereby native support
  return (
    <>
      <whereby-embed
        ref={wherebyRef as any}
        room={wherebyRoomUrl}
        style={{ width: '100vw', height: '100vh', border: 'none' }}
      />
      {showConsentButton && (
        <WherebyConsentDialogButton
          onClick={() => showConsentModalRef.current()}
          wherebyRef={wherebyRef}
        />
      )}
    </>
  );
}

// Add the web component declaration for React TypeScript integration
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'whereby-embed': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          room: string;
          style?: React.CSSProperties;
          ref?: React.Ref<any>;
        },
        HTMLElement
      >;
    }
  }
}
