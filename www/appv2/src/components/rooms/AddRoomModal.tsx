import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { 
  useRoomCreate, 
  useRoomUpdate, 
  useRoomGet,
  useRoomTestWebhook,
  useConfig,
  useZulipStreams,
  useZulipTopics
} from '../../lib/apiHooks';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Checkbox } from '../ui/Checkbox';
import { X, Info, Link as LinkIcon, CheckCircle2, AlertCircle, Hexagon, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

interface AddRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  editRoomId?: string | null;
}

type FormData = {
  name: string;
  platform: 'whereby' | 'daily';
  roomMode: 'normal' | 'group';
  recordingType: 'none' | 'local' | 'cloud';
  recordingTrigger: 'none' | 'prompt' | 'automatic-2nd-participant';
  isLocked: boolean;
  isShared: boolean;
  skipConsent: boolean;
  enableIcs: boolean;
  icsFetchInterval: number;
  emailTranscript: boolean;
  emailTranscriptTo: string;
  postToZulip: boolean;
  zulipStream: string;
  zulipTopic: string;
  webhookUrl: string;
  webhookSecret: string;
};

export function AddRoomModal({ isOpen, onClose, editRoomId }: AddRoomModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'calendar' | 'sharing' | 'webhooks'>('general');
  const [testResult, setTestResult] = useState<{ status: 'success'|'error', msg: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const queryClient = useQueryClient();

  const createRoom = useRoomCreate();
  const updateRoom = useRoomUpdate();
  const testWebhook = useRoomTestWebhook();

  const { data: config } = useConfig();
  const zulipEnabled = config?.zulip_enabled ?? false;
  const emailEnabled = config?.email_enabled ?? false;

  const { data: streams = [] } = useZulipStreams(zulipEnabled);
  
  const { data: editedRoom, isFetching: isFetchingRoom } = useRoomGet(editRoomId || null);

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      name: '',
      platform: 'whereby',
      roomMode: 'normal',
      recordingType: 'cloud',
      recordingTrigger: 'automatic-2nd-participant',
      isShared: true,
      isLocked: false,
      skipConsent: false,
      enableIcs: false,
      icsFetchInterval: 5,
      emailTranscript: false,
      emailTranscriptTo: '',
      postToZulip: false,
      zulipStream: '',
      zulipTopic: '',
      webhookUrl: '',
      webhookSecret: '',
    }
  });

  const platform = watch('platform');
  const postToZulip = watch('postToZulip');
  const webhookUrl = watch('webhookUrl');
  const recordingType = watch('recordingType');
  const selectedZulipStream = watch('zulipStream');
  const emailTranscript = watch('emailTranscript');

  // Dynamically resolve zulip stream IDs to query topics
  const selectedStreamId = React.useMemo(() => {
    if (!selectedZulipStream || streams.length === 0) return null;
    const match = streams.find(s => s.name === selectedZulipStream);
    return match ? match.stream_id : null;
  }, [selectedZulipStream, streams]);

  const { data: topics = [] } = useZulipTopics(selectedStreamId);

  useEffect(() => {
    if (isOpen) {
      if (editRoomId && editedRoom) {
        // Load Edit Mode
        reset({
          name: editedRoom.name,
          platform: editedRoom.platform as 'whereby' | 'daily',
          roomMode: editedRoom.platform === 'daily' ? 'group' : (editedRoom.room_mode || 'normal') as 'normal'|'group',
          recordingType: (editedRoom.recording_type || 'none') as 'none'|'local'|'cloud',
          recordingTrigger: editedRoom.platform === 'daily' 
            ? (editedRoom.recording_type === 'cloud' ? 'automatic-2nd-participant' : 'none')
            : (editedRoom.recording_trigger || 'none') as any,
          isShared: editedRoom.is_shared,
          isLocked: editedRoom.is_locked,
          skipConsent: editedRoom.skip_consent,
          enableIcs: editedRoom.ics_enabled || false,
          icsFetchInterval: editedRoom.ics_fetch_interval || 5,
          emailTranscript: !!editedRoom.email_transcript_to,
          emailTranscriptTo: editedRoom.email_transcript_to || '',
          postToZulip: editedRoom.zulip_auto_post || false,
          zulipStream: editedRoom.zulip_stream || '',
          zulipTopic: editedRoom.zulip_topic || '',
          webhookUrl: editedRoom.webhook_url || '',
          webhookSecret: editedRoom.webhook_secret || '',
        });
      } else if (!editRoomId) {
        // Load Create Mode with specific backend defaults
        reset({
          name: '',
          platform: 'whereby',
          roomMode: 'normal',
          recordingType: 'cloud',
          recordingTrigger: 'automatic-2nd-participant',
          isShared: false,
          isLocked: false,
          skipConsent: false,
          enableIcs: false,
          icsFetchInterval: 5,
          emailTranscript: false,
          emailTranscriptTo: '',
          postToZulip: false,
          zulipStream: '',
          zulipTopic: '',
          webhookUrl: '',
          webhookSecret: '',
        });
      }
    }
  }, [isOpen, editRoomId, editedRoom, reset]);

  // Handle rigid Platform dependency enums
  useEffect(() => {
    if (platform === 'daily') {
      setValue('roomMode', 'group');
      if (recordingType === 'cloud') {
        setValue('recordingTrigger', 'automatic-2nd-participant');
      } else {
        setValue('recordingTrigger', 'none');
      }
    } else if (platform === 'whereby') {
       if (recordingType !== 'cloud') {
         setValue('recordingTrigger', 'none');
       }
    }
  }, [platform, recordingType, setValue]);

  const handleClose = () => {
    reset();
    setActiveTab('general');
    setTestResult(null);
    onClose();
  };

  const executeWebhookTest = async () => {
    if (!webhookUrl || !editRoomId) return;
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const resp = await testWebhook.mutateAsync({
        params: { path: { room_id: editRoomId } }
      });
      if (resp.success) {
        setTestResult({ status: 'success', msg: `Test successful! Status: ${resp.status_code}` });
      } else {
        let err = `Failed (${resp.status_code})`;
        if (resp.response_preview) {
           try {
             const json = JSON.parse(resp.response_preview);
             err += `: ${json.message || resp.response_preview}`;
           } catch {
             err += `: ${resp.response_preview.substring(0, 100)}`;
           }
        }
        setTestResult({ status: 'error', msg: err });
      }
    } catch {
      setTestResult({ status: 'error', msg: "Network failed attempting to test URL." });
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmit = (data: FormData) => {
    const payload = {
      name: data.name.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase(),
      platform: data.platform,
      zulip_auto_post: data.postToZulip,
      zulip_stream: data.zulipStream,
      zulip_topic: data.zulipTopic,
      is_locked: data.isLocked,
      room_mode: data.platform === 'daily' ? 'group' : data.roomMode,
      recording_type: data.recordingType,
      recording_trigger: data.platform === 'daily' ? (data.recordingType === 'cloud' ? 'automatic-2nd-participant' : 'none') : data.recordingTrigger,
      is_shared: data.isShared,
      webhook_url: data.webhookUrl,
      webhook_secret: data.webhookSecret,
      ics_url: '',
      ics_enabled: data.enableIcs,
      ics_fetch_interval: data.icsFetchInterval,
      skip_consent: data.skipConsent,
      email_transcript_to: data.emailTranscript ? data.emailTranscriptTo : null,
    };

    if (editRoomId) {
      updateRoom.mutate({
        params: { path: { room_id: editRoomId } },
        body: payload as any
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['rooms'] });
          handleClose();
        }
      });
    } else {
      createRoom.mutate({
        body: payload as any
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['rooms'] });
          handleClose();
        }
      });
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'calendar', label: 'Calendar' },
    ...(zulipEnabled || emailEnabled ? [{ id: 'sharing', label: 'Sharing' }] : []),
    { id: 'webhooks', label: 'WebHooks' },
  ] as const;

  return (
    <div className="fixed inset-0 bg-[#1b1c14]/45 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[12px] shadow-[0_16px_48px_rgba(27,28,20,0.12)] w-[500px] max-w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="pt-6 px-6 pb-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hexagon className="w-5 h-5 text-primary fill-primary/20" />
            <h2 className="font-serif text-lg font-bold text-on-surface">
              {editRoomId ? 'Edit Room' : 'New Room'}
            </h2>
            {isFetchingRoom && <Loader2 className="w-4 h-4 animate-spin text-muted ml-2" />}
          </div>
          <button onClick={handleClose} className="text-muted hover:text-primary hover:bg-primary/10 p-1.5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="px-6 mt-4 flex items-center gap-6 relative">
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-surface-high"></div>
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 font-sans text-sm transition-colors relative z-10 ${
                activeTab === tab.id 
                  ? 'text-primary font-semibold border-b-[2.5px] border-primary' 
                  : 'text-muted font-medium hover:text-on-surface-variant'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 px-6 max-h-[60vh] overflow-y-auto">
          <form id="add-room-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            
            {activeTab === 'general' && (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div>
                  <label className="font-sans text-[0.75rem] font-bold uppercase tracking-widest text-muted mb-1.5 block">Room Name</label>
                  <Input 
                    {...register('name', { required: true })} 
                    placeholder="e.g. editorial-sync" 
                    className="w-full"
                    disabled={!!editRoomId}
                  />
                  <p className="text-xs text-muted mt-1">No spaces allowed. E.g. my-room</p>
                </div>

                <div>
                  <label className="font-sans text-[0.75rem] font-bold uppercase tracking-widest text-muted mb-1.5 block">Platform</label>
                  <Select {...register('platform')} className="w-full">
                    <option value="whereby">Whereby</option>
                    <option value="daily">Daily.co</option>
                  </Select>
                </div>

                <div className="space-y-3 pt-2">
                   <Checkbox {...register('isLocked')} label="Locked room (Require password)" />
                </div>

                {platform !== 'daily' && (
                   <div>
                     <label className="font-sans text-[0.75rem] font-bold uppercase tracking-widest text-muted mb-1.5 block">Room Size</label>
                     <Select {...register('roomMode')} className="w-full">
                       <option value="normal">2-4 people</option>
                       <option value="group">2-200 people</option>
                     </Select>
                   </div>
                )}

                <div>
                  <label className="font-sans text-[0.75rem] font-bold uppercase tracking-widest text-muted mb-1.5 flex items-center gap-1.5">
                    Recording Type
                    <Info className="w-3.5 h-3.5 text-muted hover:text-primary transition-colors cursor-help" />
                  </label>
                  <Select {...register('recordingType')} className="w-full">
                    <option value="none">None</option>
                    <option value="local">Local</option>
                    <option value="cloud">Cloud</option>
                  </Select>
                </div>

                {recordingType === 'cloud' && platform !== 'daily' && (
                  <div>
                    <label className="font-sans text-[0.75rem] font-bold uppercase tracking-widest text-muted mb-1.5 block">Recording Trigger</label>
                    <Select {...register('recordingTrigger')} className="w-full">
                      <option value="none">None (Manual)</option>
                      <option value="prompt">Prompt on Join</option>
                      <option value="automatic-2nd-participant">Automatic on 2nd Participant</option>
                    </Select>
                  </div>
                )}

                <div className="space-y-3 pt-2 border-t border-outline-variant/10">
                  <Checkbox {...register('isShared')} label="Shared room (Public archive)" />
                  <Checkbox {...register('skipConsent')} label="Skip consent checkbox" />
                </div>
              </div>
            )}

            {activeTab === 'calendar' && (
              <div className="space-y-2 animate-in fade-in duration-300">
                <Checkbox {...register('enableIcs')} label="Enable ICS calendar sync" />
                <p className="font-sans text-sm text-muted ml-6">When enabled, a calendar feed URL will be generated.</p>
              </div>
            )}

            {activeTab === 'sharing' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                {emailEnabled && (
                  <div className="space-y-2 pb-4 border-b border-outline-variant/10">
                    <Checkbox {...register('emailTranscript')} label="Email transcript functionality" />
                    {emailTranscript && (
                      <div className="pl-6 animate-in slide-in-from-top-2">
                        <label className="font-sans text-[0.75rem] font-bold uppercase tracking-widest text-muted mb-1.5 block">Email Address</label>
                        <Input type="email" {...register('emailTranscriptTo')} placeholder="editor@nyt.com" className="w-full" />
                      </div>
                    )}
                  </div>
                )}

                {zulipEnabled && (
                  <div className="space-y-2">
                    <Checkbox {...register('postToZulip')} label="Automatically post transcription to Zulip" />
                    <div className={`overflow-hidden transition-all duration-300 ${postToZulip ? 'max-h-48 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                      <div className="pl-6 space-y-4 border-l-2 border-surface-high ml-2 py-1">
                        <div>
                          <label className="font-sans text-[0.75rem] font-bold uppercase tracking-widest text-muted mb-1.5 block">Zulip stream</label>
                          <Select {...register('zulipStream')} disabled={!postToZulip} className="w-full">
                            <option value="">Select stream...</option>
                            {streams.map(s => <option key={s.stream_id} value={s.name}>{s.name}</option>)}
                          </Select>
                        </div>
                        <div>
                          <label className="font-sans text-[0.75rem] font-bold uppercase tracking-widest text-muted mb-1.5 block">Zulip topic</label>
                          <Select {...register('zulipTopic')} disabled={!postToZulip} className="w-full">
                            <option value="">Select topic...</option>
                            {topics.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'webhooks' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div>
                  <label className="font-sans text-[0.75rem] font-bold uppercase tracking-widest text-muted mb-1.5 block">Webhook URL</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <LinkIcon className="w-4 h-4 text-muted" />
                    </div>
                    <Input 
                      {...register('webhookUrl', { pattern: { value: /^https?:\/\/.+/, message: 'Must be a valid URL starting with http:// or https://' }})} 
                      placeholder="https://example.com/webhook" 
                      className="w-full pl-9 pr-9" 
                    />
                  </div>
                  {errors.webhookUrl && <p className="font-sans text-[0.75rem] text-primary mt-1.5">{errors.webhookUrl.message}</p>}
                </div>
                
                {webhookUrl && editRoomId && (
                  <div className="pt-2 border-t border-shell">
                     <Button 
                        type="button" 
                        variant="secondary" 
                        onClick={executeWebhookTest}
                        disabled={isTesting}
                        className="mb-3"
                      >
                        {isTesting ? 'Testing...' : 'Test Webhook Settings'}
                     </Button>
                     {testResult && (
                       <div className={`p-3 rounded-lg text-sm border font-mono ${testResult.status === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                         {testResult.msg}
                       </div>
                     )}
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-low rounded-b-[12px] flex items-center justify-between border-t border-outline-variant/10">
          <Button variant="secondary" onClick={handleClose} className="border-[1.5px] border-[#C8C8BE] text-on-surface-variant hover:bg-surface-high">
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="add-room-form" disabled={createRoom.isPending || updateRoom.isPending}>
            {createRoom.isPending || updateRoom.isPending ? 'Saving...' : 'Save Room'}
          </Button>
        </div>

      </div>
    </div>
  );
}
