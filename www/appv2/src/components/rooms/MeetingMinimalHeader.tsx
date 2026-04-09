import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Hexagon } from 'lucide-react';

interface MeetingMinimalHeaderProps {
  roomName: string;
  displayName?: string | null;
  showLeaveButton?: boolean;
  onLeave?: () => void;
  showCreateButton?: boolean;
  onCreateMeeting?: () => void;
  isCreatingMeeting?: boolean;
}

export default function MeetingMinimalHeader({
  roomName,
  displayName,
  showLeaveButton = true,
  onLeave,
  showCreateButton = false,
  onCreateMeeting,
  isCreatingMeeting = false,
}: MeetingMinimalHeaderProps) {
  const navigate = useNavigate();

  const handleLeaveMeeting = () => {
    if (onLeave) {
      onLeave();
    } else {
      navigate('/rooms');
    }
  };

  const roomTitle = displayName
    ? displayName.endsWith("'s") || displayName.endsWith("s")
      ? `${displayName} Room`
      : `${displayName}'s Room`
    : `${roomName} Room`;

  return (
    <header className="flex justify-between items-center w-full py-4 px-6 bg-surface sticky top-0 z-10 border-b border-surface-high">
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center">
          <Hexagon className="w-6 h-6 text-primary fill-primary/20" />
        </Link>
        <span className="font-serif text-lg font-semibold text-on-surface">
          {roomTitle}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {showCreateButton && onCreateMeeting && (
          <Button
            variant="primary"
            onClick={onCreateMeeting}
            disabled={isCreatingMeeting}
          >
            {isCreatingMeeting ? 'Creating...' : 'Create Meeting'}
          </Button>
        )}
        {showLeaveButton && (
          <Button
            variant="secondary"
            onClick={handleLeaveMeeting}
            disabled={isCreatingMeeting}
            className="border-[1.5px] border-[#C8C8BE] text-on-surface-variant hover:bg-surface-high"
          >
            Leave Room
          </Button>
        )}
      </div>
    </header>
  );
}
