import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranscriptsSearch, useTranscriptDelete, useRoomsList } from '../lib/apiHooks';
import type { components } from '../lib/reflector-api';
import { useAuth } from '../lib/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useQueryClient } from '@tanstack/react-query';
import {
  Search,
  FolderOpen,
  Star,
  Trash2,
  MoreVertical,
  Download,
  Mic,
  UploadCloud,
  MicOff,
  Globe,
  Mail,
  Calendar,
  Clock,
  Users
} from 'lucide-react';

export default function TranscriptionsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = 20;

  const [activeSourceKind, setActiveSourceKind] = useState<components['schemas']['SourceKind'] | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const queryClient = useQueryClient();
  const deleteTranscriptMutation = useTranscriptDelete();
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const { data: roomsData } = useRoomsList(1);
  const rooms = roomsData?.items || [];
  const myRooms = rooms.filter((room) => !room.is_shared);
  const sharedRooms = rooms.filter((room) => room.is_shared);

  const handleFilterChange = (sourceKind: components['schemas']['SourceKind'] | null, roomId: string | null) => {
    setActiveSourceKind(sourceKind);
    setActiveRoomId(roomId);
    setCurrentPage(0);
  };

  const handleDeleteTranscript = () => {
    if (!itemToDelete) return;
    deleteTranscriptMutation.mutate(
      { params: { path: { transcript_id: itemToDelete } } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/v1/transcripts'] });
          setItemToDelete(null);
        },
      }
    );
  };

  const { data: transcriptsData, isLoading, isError } = useTranscriptsSearch(debouncedQuery, {
    limit: PAGE_SIZE,
    offset: currentPage * PAGE_SIZE,
    room_id: activeRoomId || undefined,
    source_kind: activeSourceKind || undefined,
  });

  const { register, watch } = useForm({
    defaultValues: {
      search: ''
    }
  });

  const searchValue = watch('search');

  // Debounce search input
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(searchValue);
      setCurrentPage(0);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchValue]);

  const displayTranscriptions = transcriptsData?.results ?? [];

  return (
    <div className="flex-1 bg-surface flex flex-col font-sans text-on-surface selection:bg-primary-fixed">
      <main className="flex-1 p-8 md:p-12 max-w-7xl mx-auto w-full flex flex-col">

        {/* Header */}
        <div className="mb-6 border-b border-outline-variant/10 pb-6 shrink-0">
          <h1 className="font-serif text-[1.75rem] font-bold text-on-surface leading-tight">
            {auth.status === 'authenticated' && auth.user?.name ? `${auth.user.name}'s Transcriptions` : 'Your Transcriptions'}
          </h1>
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 flex-1 items-start min-h-0">
          
          <div className="w-full md:hidden">
            <Button 
              type="button"
              variant="secondary" 
              onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)} 
              className="w-full justify-center flex items-center gap-2 shadow-sm bg-surface-low"
            >
              {isMobileFiltersOpen ? 'Hide Filters' : 'Show Filters'}
            </Button>
          </div>

          {/* Sidebar Filters */}
          <aside className={`w-full md:w-56 shrink-0 bg-surface-low rounded-xl p-5 space-y-6 md:sticky md:top-8 border border-outline-variant/20 shadow-sm ${isMobileFiltersOpen ? 'block' : 'hidden md:block'}`}>
            <button 
              onClick={() => handleFilterChange(null, null)}
              className={`w-full text-left font-sans text-[0.9375rem] font-medium transition-colors ${!activeSourceKind && !activeRoomId ? 'text-primary' : 'text-on-surface-variant hover:text-primary'}`}
            >
              All Transcripts
            </button>
            <div className="w-full h-px bg-outline-variant/20" />

            {myRooms.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-sans text-[0.8125rem] font-bold text-on-surface tracking-wide uppercase">My Rooms</h3>
                <div className="flex flex-col gap-2.5">
                  {myRooms.map(room => (
                    <button 
                      key={room.id}
                      onClick={() => handleFilterChange('room', room.id)}
                      className={`text-left font-sans text-[0.9375rem] transition-colors truncate w-full ${activeSourceKind === 'room' && activeRoomId === room.id ? 'text-primary font-medium' : 'text-on-surface-variant hover:text-primary'}`}
                    >
                      {room.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sharedRooms.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-sans text-[0.8125rem] font-bold text-on-surface tracking-wide uppercase mt-4">Shared Rooms</h3>
                <div className="flex flex-col gap-2.5">
                  {sharedRooms.map(room => (
                    <button 
                      key={room.id}
                      onClick={() => handleFilterChange('room', room.id)}
                      className={`text-left font-sans text-[0.9375rem] transition-colors truncate w-full ${activeSourceKind === 'room' && activeRoomId === room.id ? 'text-primary font-medium' : 'text-on-surface-variant hover:text-primary'}`}
                    >
                      {room.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            <div className="w-full h-px bg-outline-variant/20 mt-4" />
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => handleFilterChange('live', null)}
                className={`text-left font-sans text-[0.9375rem] transition-colors ${activeSourceKind === 'live' ? 'text-primary font-medium' : 'text-on-surface-variant hover:text-primary'}`}
              >
                Live Transcripts
              </button>
              <button 
                onClick={() => handleFilterChange('file', null)}
                className={`text-left font-sans text-[0.9375rem] transition-colors ${activeSourceKind === 'file' ? 'text-primary font-medium' : 'text-on-surface-variant hover:text-primary'}`}
              >
                Uploaded Files
              </button>
            </div>
          </aside>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 w-full">
            
            {/* Search */}
            <form 
              className="flex items-center mb-6" 
              onSubmit={(e) => { 
                e.preventDefault(); 
                setDebouncedQuery(searchValue); 
                setCurrentPage(0); 
              }}
            >
              <div className="relative group flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  {...register('search')}
                  className="pl-11 pr-4 py-3 w-full bg-surface-high border border-outline-variant/20 hover:border-outline-variant/40 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[0.9375rem] text-on-surface placeholder:text-muted shadow-sm"
                  placeholder="Search transcriptions..."
                />
              </div>
              <Button type="submit" variant="primary" className="rounded-l-none py-3 px-6 shadow-sm border border-transparent">
                Search
              </Button>
            </form>

            {/* Pagination Controls */}
            {(() => {
              const totalCount = transcriptsData?.total || 0;
              const totalPages = Math.ceil(totalCount / PAGE_SIZE);
              if (totalPages <= 1) return null;

              // Simple sliding window
              let startPage = Math.max(0, currentPage - 2);
              let endPage = Math.min(totalPages - 1, currentPage + 2);
              
              if (currentPage <= 2) {
                endPage = Math.min(totalPages - 1, 4);
              }
              if (currentPage >= totalPages - 3) {
                startPage = Math.max(0, totalPages - 5);
              }

              const pages = [];
              for (let i = startPage; i <= endPage; i++) {
                pages.push(i);
              }

              return (
                <div className="mb-6 flex items-center justify-center gap-2">
                  <button 
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                    className={`w-8 h-8 flex items-center justify-center rounded border border-outline-variant/40 transition-colors ${currentPage === 0 ? 'opacity-50 cursor-not-allowed text-muted' : 'text-muted hover:bg-surface-high'}`}
                  >
                    <span className="text-lg leading-none mb-0.5">‹</span>
                  </button>
                  
                  {startPage > 0 && (
                    <>
                      <button onClick={() => setCurrentPage(0)} className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant/40 text-on-surface-variant hover:bg-surface-high transition-colors font-sans text-sm font-medium bg-surface">1</button>
                      {startPage > 1 && <span className="px-1 text-muted text-sm">...</span>}
                    </>
                  )}

                  {pages.map(page => (
                    <button 
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 flex items-center justify-center rounded font-sans text-sm ${page === currentPage ? 'bg-primary text-white font-bold' : 'border border-outline-variant/40 text-on-surface-variant hover:bg-surface-high transition-colors font-medium bg-surface'}`}
                    >
                      {page + 1}
                    </button>
                  ))}

                  {endPage < totalPages - 1 && (
                    <>
                      {endPage < totalPages - 2 && <span className="px-1 text-muted text-sm">...</span>}
                      <button onClick={() => setCurrentPage(totalPages - 1)} className="w-8 h-8 flex items-center justify-center rounded border border-outline-variant/40 text-on-surface-variant hover:bg-surface-high transition-colors font-sans text-sm font-medium bg-surface">{totalPages}</button>
                    </>
                  )}

                  <button 
                    onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage === totalPages - 1}
                    className={`w-8 h-8 flex items-center justify-center rounded border border-outline-variant/40 transition-colors ${currentPage === totalPages - 1 ? 'opacity-50 cursor-not-allowed text-muted' : 'text-muted hover:bg-surface-high'}`}
                  >
                    <span className="text-lg leading-none mb-0.5">›</span>
                  </button>
                </div>
              );
            })()}

            {/* Transcription List */}
            <div className="space-y-3">
              {isLoading ? (
                <div className="p-16 flex flex-col items-center justify-center border border-outline-variant/20 rounded-xl bg-surface">
                  <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                  <p className="text-sm text-muted">Loading transcriptions...</p>
                </div>
              ) : isError ? (
                <div className="p-16 flex flex-col items-center justify-center text-center border border-outline-variant/20 rounded-xl bg-surface">
                  <FolderOpen className="w-10 h-10 text-red-300 mb-4" strokeWidth={1.5} />
                  <p className="text-sm text-red-600">Failed to load transcriptions.</p>
                </div>
              ) : displayTranscriptions.length === 0 ? (
                <div className="p-16 flex flex-col items-center justify-center text-center border border-outline-variant/20 rounded-xl bg-surface">
                  <FolderOpen className="w-10 h-10 text-outline-variant mb-4" strokeWidth={1.5} />
                  <p className="font-serif italic text-on-surface-variant">No transcriptions found.</p>
                </div>
              ) : (
                displayTranscriptions.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/transcriptions/${item.id}`)}
                    className="group flex items-center p-4 rounded-xl border border-outline-variant/20 hover:border-outline-variant/40 hover:bg-surface-high transition-colors cursor-pointer bg-surface shadow-sm"
                  >
                    <div className="flex items-center justify-center w-8 shrink-0">
                      <div className={`w-2.5 h-2.5 rounded-full ${item.status === 'ended' ? 'bg-primary' : item.status === 'error' ? 'bg-red-400' : 'bg-muted'}`}></div>
                    </div>

                    <div className="flex-1 px-3 min-w-0">
                      <h4 className="font-serif text-[1.0625rem] font-semibold text-on-surface group-hover:text-primary transition-colors truncate mb-1">
                        {item.title || 'Untitled Transcript'}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.75rem] text-muted font-sans">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" /> {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                    </span>
                    <span className="text-outline-variant/60">•</span>
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> {item.room_name ?? 'Personal'}
                    </span>
                    <span className="text-outline-variant/60">•</span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> {item.duration ? `${Math.round(item.duration / 60)}m` : '—'}
                    </span>
                    <span className="text-outline-variant/60">•</span>
                    <span className="bg-surface-high px-2 py-0.5 rounded-md text-on-surface-variant font-medium">
                      {item.source_kind || 'upload'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 text-muted hover:text-primary hover:bg-primary/5 rounded-md transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setItemToDelete(item.id); }}
                    className="p-2 text-muted hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete transcription"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 text-muted hover:text-primary hover:bg-primary/5 rounded-md transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
          </div>

          </div>
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

      <ConfirmModal
        isOpen={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleDeleteTranscript}
        title="Delete Transcription"
        description="Are you sure you want to discard this transcription? This will permanently erase the transcript, its AI summaries, and any generated metadata."
        confirmText="Delete"
        isDestructive={true}
        isLoading={deleteTranscriptMutation.isPending}
      />
    </div>
  );
}
