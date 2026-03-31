import React, { useState } from 'react';
import { useRoomsList, useRoomDelete } from '../lib/apiHooks';
import { useAuth } from '../lib/AuthProvider';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { AddRoomModal } from '../components/rooms/AddRoomModal';
import { useNavigate } from 'react-router-dom';
import { 
  PlusCircle, 
  Compass, 
  FolderOpen, 
  Link as LinkIcon, 
  MoreVertical,
  Wrench,
  CheckCircle2,
  Edit3,
  Trash2,
  Calendar,
  Clock,
  RefreshCw
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRoomActiveMeetings, useRoomUpcomingMeetings, useRoomIcsSync } from '../lib/apiHooks';

const MEETING_DEFAULT_TIME_MINUTES = 15;

const getRoomModeDisplay = (mode: string): string => {
  switch (mode) {
    case "normal": return "2-4 people";
    case "group": return "2-200 people";
    default: return mode;
  }
};

const getRecordingDisplay = (type: string, trigger: string): string => {
  if (type === "none") return "-";
  if (type === "local") return "Local";
  if (type === "cloud") {
    switch (trigger) {
      case "none": return "Cloud (None)";
      case "prompt": return "Cloud (Prompt)";
      case "automatic-2nd-participant": return "Cloud (Auto)";
      default: return `Cloud (${trigger})`;
    }
  }
  return type;
};

const getZulipDisplay = (autoPost: boolean, stream: string, topic: string): string => {
  if (!autoPost) return "-";
  if (stream && topic) return `${stream} > ${topic}`;
  if (stream) return stream;
  return "Enabled";
};

function MeetingStatus({ roomName }: { roomName: string }) {
  const activeMeetingsQuery = useRoomActiveMeetings(roomName);
  const upcomingMeetingsQuery = useRoomUpcomingMeetings(roomName);

  const activeMeetings = activeMeetingsQuery.data || [];
  const upcomingMeetings = upcomingMeetingsQuery.data || [];

  if (activeMeetingsQuery.isLoading || upcomingMeetingsQuery.isLoading) {
    return <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />;
  }

  if (activeMeetings.length > 0) {
    const meeting = activeMeetings[0];
    const title = String(meeting.calendar_metadata?.['title'] || "Active Meeting");
    return (
      <div className="flex flex-col gap-1 items-start">
        <span className="font-sans text-[0.75rem] text-on-surface font-semibold leading-none">{title}</span>
        <span className="font-sans text-[0.6875rem] text-muted leading-none">{meeting.num_clients} participants</span>
      </div>
    );
  }

  if (upcomingMeetings.length > 0) {
    const event = upcomingMeetings[0];
    const startTime = new Date(event.start_time);
    const now = new Date();
    const diffMinutes = Math.floor((startTime.getTime() - now.getTime()) / 60000);

    return (
      <div className="flex flex-col gap-1 items-start">
        <span className="inline-block bg-[#D2E7D9] text-[#1D4A2F] dark:bg-[#1D4A2F] dark:text-[#D2E7D9] px-2 py-0.5 rounded font-sans text-[0.625rem] font-bold uppercase tracking-wider">
          {diffMinutes < MEETING_DEFAULT_TIME_MINUTES ? `In ${diffMinutes}m` : "Upcoming"}
        </span>
        <span className="font-sans text-[0.75rem] text-on-surface font-semibold leading-none mt-0.5">
          {event.title || "Scheduled Meeting"}
        </span>
        <span className="font-sans text-[0.6875rem] text-muted leading-none">
          {startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
        </span>
      </div>
    );
  }

  return <span className="font-sans text-[0.75rem] text-muted italic">No meetings</span>;
}

export default function RoomsPage() {
  const queryClient = useQueryClient();
  const { data: roomsData, isLoading, isError } = useRoomsList(1);
  const syncMutation = useRoomIcsSync();
  const deleteRoomMutation = useRoomDelete();
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false);
  const [editRoomId, setEditRoomId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my');
  const [copiedRoom, setCopiedRoom] = useState<string | null>(null);
  const [syncingRooms, setSyncingRooms] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const rooms = roomsData?.items ?? [];
  const filteredRooms = rooms.filter(r => (activeTab === 'my') ? !r.is_shared : r.is_shared);

  const handleCopyLink = (roomName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/rooms/${roomName}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedRoom(roomName);
      setTimeout(() => setCopiedRoom(null), 2000);
    });
  };

  const handleForceSync = async (roomName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncingRooms((prev) => new Set(prev).add(roomName));
    try {
      await syncMutation.mutateAsync({
        params: { path: { room_name: roomName } },
      });
    } catch (err) {
      console.error("Failed to sync calendar:", err);
    } finally {
      setSyncingRooms((prev) => {
        const next = new Set(prev);
        next.delete(roomName);
        return next;
      });
    }
  };

  const openAddModal = () => {
    setEditRoomId(null);
    setIsAddRoomModalOpen(true);
  };

  const openEditModal = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditRoomId(roomId);
    setIsAddRoomModalOpen(true);
  };

  const handleDelete = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this room? This action cannot be reversed.")) {
      deleteRoomMutation.mutate({ 
        params: { path: { room_id: roomId as any } } 
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['rooms'] });
        }
      });
    }
  };

  return (
    <div className="flex-1 bg-surface flex flex-col font-sans text-on-surface selection:bg-primary-fixed">
      <main className="flex-1 p-8 md:p-12 w-full space-y-10">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="font-serif text-[1.75rem] font-bold text-on-surface">Rooms</h1>
          <Button 
            variant="primary" 
            className="flex items-center gap-2 self-start sm:self-auto shadow-[0_0_15px_rgba(235,108,67,0.2)] hover:shadow-[0_0_20px_rgba(235,108,67,0.4)] transition-all"
            onClick={openAddModal}
          >
            <PlusCircle className="w-4 h-4" />
            Add Room
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-surface-high pb-4">
          <button
            onClick={() => setActiveTab('my')}
            className={`px-4 py-1.5 rounded-full font-sans text-sm font-semibold transition-colors ${
              activeTab === 'my' 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-muted hover:bg-surface-high hover:text-on-surface-variant'
            }`}
          >
            My Rooms
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            className={`px-4 py-1.5 rounded-full font-sans text-sm font-semibold transition-colors ${
              activeTab === 'shared' 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-muted hover:bg-surface-high hover:text-on-surface-variant'
            }`}
          >
            Shared Rooms
          </button>
        </div>

        {/* Rooms Table / Empty State */}
        <div className="bg-surface-highest rounded-2xl shadow-card overflow-hidden border border-outline-variant/10">
          {isLoading ? (
            <div className="p-20 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
              <p className="font-serif italic text-sm text-muted">Retrieving rooms...</p>
            </div>
          ) : isError ? (
            <div className="p-20 flex flex-col items-center justify-center text-center">
              <FolderOpen className="w-10 h-10 text-red-300 mb-4" strokeWidth={1.5} />
              <p className="text-sm font-serif italic text-red-600">Archive connection failed. Please try again.</p>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="p-20 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-surface-high flex items-center justify-center mb-6">
                <FolderOpen className="w-8 h-8 text-on-surface-variant opacity-50" strokeWidth={1.5} />
              </div>
              <p className="font-serif italic text-on-surface-variant text-lg mb-6 max-w-sm">
                {activeTab === 'my' ? "You haven't curated any rooms yet. Begin a new archival context." : "No shared rooms available in your workspace."}
              </p>
              {activeTab === 'my' && (
                <Button variant="secondary" className="flex items-center gap-2" onClick={openAddModal}>
                  Start Curating
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/10 bg-surface-high/30">
                    <th className="px-6 py-4 font-sans text-[0.6875rem] font-bold uppercase tracking-[0.10em] text-muted">Room Name</th>
                    <th className="px-6 py-4 font-sans text-[0.6875rem] font-bold uppercase tracking-[0.10em] text-muted">Current Meeting</th>
                    <th className="px-6 py-4 font-sans text-[0.6875rem] font-bold uppercase tracking-[0.10em] text-muted">Zulip</th>
                    <th className="px-6 py-4 font-sans text-[0.6875rem] font-bold uppercase tracking-[0.10em] text-muted">Room Size</th>
                    <th className="px-6 py-4 font-sans text-[0.6875rem] font-bold uppercase tracking-[0.10em] text-muted">Recording</th>
                    <th className="px-6 py-4 font-sans text-[0.6875rem] font-bold uppercase tracking-[0.10em] text-muted text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/5">
                  {filteredRooms.map((room) => (
                    <tr key={room.id} className="group hover:bg-surface-low transition-colors duration-200">
                      <td className="px-6 py-4 align-middle">
                        <div className="flex flex-col">
                           <span 
                             onClick={() => navigate(`/rooms/${room.name}`)}
                             className="font-serif text-[1rem] font-bold text-on-surface hover:text-primary transition-colors cursor-pointer"
                           >
                             {room.name}
                           </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 align-middle">
                        <MeetingStatus roomName={room.name} />
                      </td>

                      <td className="px-6 py-4 align-middle">
                        <span className="font-sans text-[0.8125rem] text-on-surface-variant">
                          {getZulipDisplay(room.zulip_auto_post, room.zulip_stream || '', room.zulip_topic || '')}
                        </span>
                      </td>

                      <td className="px-6 py-4 align-middle">
                        <span className="font-sans text-[0.8125rem] text-on-surface-variant">
                          {getRoomModeDisplay(room.room_mode || '')}
                        </span>
                      </td>

                      <td className="px-6 py-4 align-middle">
                        <span className="font-sans text-[0.8125rem] text-on-surface-variant">
                          {getRecordingDisplay(room.recording_type || '', room.recording_trigger || '')}
                        </span>
                      </td>

                      <td className="px-6 py-4 align-middle text-right">
                        <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {room.ics_enabled && (
                            <button 
                              onClick={(e) => handleForceSync(room.name, e)}
                              disabled={syncingRooms.has(room.name)}
                              title="Force sync calendar"
                              className="p-2 text-muted hover:text-primary hover:bg-primary/5 rounded-[6px] transition-colors relative"
                            >
                              {syncingRooms.has(room.name) ? <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            </button>
                          )}
                          <button 
                             onClick={(e) => handleCopyLink(room.name, e)}
                             title="Copy room link"
                             className="p-2 text-muted hover:text-primary hover:bg-primary/5 rounded-[6px] transition-colors relative"
                          >
                            {copiedRoom === room.name ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <LinkIcon className="w-4 h-4" />}
                          </button>
                          
                          <button 
                             onClick={(e) => openEditModal(room.id, e)}
                             title="Edit room configuration"
                             className="p-2 text-muted hover:text-secondary hover:bg-secondary/5 rounded-[6px] transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {!room.is_shared && (
                             <button 
                               onClick={(e) => handleDelete(room.id, e)}
                               title="Permanently discard room"
                               className="p-2 text-muted hover:text-red-500 hover:bg-red-500/5 rounded-[6px] transition-colors"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="mt-auto bg-surface-low py-8 px-8 flex flex-col md:flex-row justify-between items-center gap-4 border-t border-outline-variant/20">
        <span className="text-[0.6875rem] font-medium text-on-surface-variant uppercase tracking-widest">
          © 2024 Reflector Archive
        </span>
        <div className="flex items-center gap-6">
          <a href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">Learn more</a>
          <a href="#" className="text-sm text-on-surface-variant hover:text-primary transition-colors">Privacy policy</a>
        </div>
      </footer>

      <AddRoomModal 
        isOpen={isAddRoomModalOpen} 
        onClose={() => setIsAddRoomModalOpen(false)} 
        editRoomId={editRoomId}
      />
    </div>
  );
}
