import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Settings, Mic, Upload, Sparkles, CircleDot } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { FieldError } from '../components/ui/FieldError';
import { useNavigate, Link } from 'react-router-dom';
import { useTranscriptCreate } from '../lib/apiHooks';
import { useAudioDevice } from '../hooks/useAudioDevice';
import { supportedLanguages } from '../lib/supportedLanguages';

const sourceLanguages = supportedLanguages.filter(
  (l) => l.value && l.value !== 'NOTRANSLATION',
);

type TryReflectorForm = {
  meetingTitle: string;
  sourceLanguage: string;
  targetLanguage: string;
};

export default function WelcomePage() {
  const navigate = useNavigate();
  
  const { register, handleSubmit, formState: { errors } } = useForm<TryReflectorForm>({
    defaultValues: {
      meetingTitle: '',
      sourceLanguage: 'en',
      targetLanguage: 'NOTRANSLATION',
    }
  });

  const { loading: permissionLoading, permissionOk, permissionDenied, requestPermission } = useAudioDevice();
  const transcriptMutation = useTranscriptCreate();

  const [loadingRecord, setLoadingRecord] = useState(false);
  const [loadingUpload, setLoadingUpload] = useState(false);

  const onSubmit = (data: TryReflectorForm, sourceKind: 'live' | 'file') => {
    if (loadingRecord || loadingUpload || transcriptMutation.isPending || permissionDenied) return;
    
    if (sourceKind === 'live') setLoadingRecord(true);
    else setLoadingUpload(true);

    transcriptMutation.mutate({
      body: {
        name: data.meetingTitle || 'Untitled Recording',
        source_language: data.sourceLanguage || 'en',
        target_language: data.targetLanguage === 'NOTRANSLATION' ? undefined : data.targetLanguage,
        source_kind: sourceKind
      }
    }, {
      onSuccess: (res) => {
        // Upon success, navigate explicitly to the transcript view
        navigate(`/transcriptions/${res.id}`);
      },
      onError: () => {
        setLoadingRecord(false);
        setLoadingUpload(false);
      }
    });
  };

  const isFormLoading = loadingRecord || loadingUpload || transcriptMutation.isPending;

  return (
    <div className="flex-1 bg-surface flex flex-col font-sans text-on-surface selection:bg-primary-fixed">
      {/* Main Content */}
      <main className="flex-1 flex flex-col px-6 pt-16 pb-24">
        <div className="w-full max-w-6xl mx-auto space-y-24">
          
          {/* Top Section: Two Columns */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 items-center">
            
            {/* Left Column: Hero Copy */}
            <div className="lg:col-span-7 space-y-8">
              <h1 className="text-[2.5rem] md:text-[3.5rem] font-serif font-bold text-on-surface leading-[1.1] tracking-tight">
                Welcome to Reflector
              </h1>
              
              <p className="text-[0.9375rem] text-on-surface-variant max-w-[440px] leading-[1.6]">
                Reflector is a transcription and summarization pipeline that
                transforms audio into knowledge. The output is meeting minutes and topic summaries enabling
                topic-specific analyses stored in your systems of record. This is
                accomplished on your infrastructure – without 3rd parties –
                keeping your data private, secure, and organized.
              </p>
              
              <p className="text-[0.9375rem] text-on-surface-variant max-w-[440px] leading-[1.6]">
                In order to use Reflector, we kindly request permission to access
                your microphone during meetings and events.
              </p>
              
              <div className="flex items-center gap-4 pt-4">
                <Button variant="secondary" onClick={() => navigate('/transcriptions')}>Archive</Button>
                <Button variant="secondary" onClick={() => navigate('/rooms')}>Rooms</Button>
              </div>
            </div>

            {/* Right Column: Try Reflector Widget */}
            <div className="lg:col-span-5">
              <Card className="p-7">
                <form className="space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-serif font-bold text-xl">Try Reflector</h2>
                    <button type="button" className="text-muted hover:text-on-surface transition-colors">
                      <Settings className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="block font-sans text-[0.75rem] font-semibold text-on-surface-variant uppercase tracking-wider">
                        Recording Name
                      </label>
                      <Input 
                        {...register('meetingTitle')}
                        placeholder="Optional"
                        className="w-full"
                      />
                      <FieldError message={errors.meetingTitle?.message} />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-sans text-[0.75rem] font-semibold text-on-surface-variant uppercase tracking-wider">
                        Audio Language
                      </label>
                      <Select 
                        {...register('sourceLanguage')}
                        className="w-full font-medium"
                      >
                        {sourceLanguages.map(lang => (
                          <option key={lang.value} value={lang.value}>{lang.name}</option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-sans text-[0.75rem] font-semibold text-on-surface-variant uppercase tracking-wider">
                        Live Translation
                      </label>
                      <Select 
                        {...register('targetLanguage')}
                        className="w-full font-medium"
                      >
                        {supportedLanguages.map(lang => (
                          <option key={lang.value} value={lang.value}>{lang.name}</option>
                        ))}
                      </Select>
                      <FieldError message={errors.targetLanguage?.message} />
                    </div>
                  </div>

                  {/* Permission / Action Buttons */}
                  {!permissionLoading ? (
                    permissionOk ? (
                      <div className="pt-2 text-[0.75rem] text-green-700 font-medium">✓ Microphone access granted</div>
                    ) : permissionDenied ? (
                      <div className="pt-2 text-[0.85rem] text-red-600">
                        Permission to use your microphone was denied, please turn it on in your browser settings and refresh.
                      </div>
                    ) : (
                      <Button 
                        type="button" 
                        variant="primary" 
                        onClick={requestPermission}
                        disabled={permissionDenied}
                        className="w-full flex items-center justify-center gap-2 py-3 text-[0.9375rem]"
                      >
                        <Mic className="w-4 h-4" />
                        Request Microphone Permission
                      </Button>
                    )
                  ) : (
                    <div className="pt-2 text-[0.85rem] text-muted">Checking permissions...</div>
                  )}

                  <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-surface-high"></div>
                    <span className="flex-shrink-0 mx-4 text-[0.6875rem] text-muted uppercase tracking-widest font-medium">OR</span>
                    <div className="flex-grow border-t border-surface-high"></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      type="button" 
                      onClick={handleSubmit((data) => onSubmit(data, 'live'))}
                      disabled={!permissionOk || isFormLoading}
                      variant="primary" 
                      className="flex flex-col items-center justify-center gap-2 py-4 h-auto"
                    >
                      <CircleDot className="w-5 h-5" />
                      <span className="text-xs">{loadingRecord ? "Starting..." : "Record Meeting"}</span>
                    </Button>
                    <Button 
                      type="button" 
                      variant="secondary" 
                      onClick={handleSubmit((data) => onSubmit(data, 'file'))}
                      disabled={isFormLoading}
                      className="flex flex-col items-center justify-center gap-2 py-4 h-auto border-outline-variant/40 text-on-surface hover:bg-surface-mid"
                    >
                      <Upload className="w-5 h-5" />
                      <span className="text-xs">{loadingUpload ? "Preparing..." : "Upload File"}</span>
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          </div>

          {/* Feature Cards Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            
            {/* Card 1 */}
            <div className="relative h-[320px] rounded-md overflow-hidden group">
              <img 
                src="https://images.unsplash.com/photo-1507842217343-583bb7270b66?q=80&w=2400&auto=format&fit=crop" 
                alt="Library aesthetic" 
                className="absolute inset-0 w-full h-full object-cover grayscale-[30%] group-hover:scale-105 transition-transform duration-700"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
              <div className="absolute bottom-0 left-0 p-8 space-y-2">
                <h3 className="font-serif italic text-2xl text-white">The Editorial standard for your audio.</h3>
                <p className="text-white/80 text-sm max-w-[280px] leading-relaxed">
                  Our curation engine doesn't just transcribe; it captures the essence, tone, and authority of your spoken words.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-gradient-primary rounded-md p-10 flex flex-col justify-center relative overflow-hidden">
              <div className="absolute -right-12 -top-12 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
              <div className="relative z-10 space-y-6">
                <Sparkles className="w-10 h-10 text-white" />
                <div className="space-y-3">
                  <h3 className="font-serif font-bold text-3xl text-white">AI Synthesis</h3>
                  <p className="text-white/85 text-[0.9375rem] leading-relaxed max-w-[320px]">
                    Turn hours of live discussion into a structured archive of actionable insight and creative sparks.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
