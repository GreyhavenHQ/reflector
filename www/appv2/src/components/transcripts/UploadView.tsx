import React, { useState, useRef } from 'react';
import { useTranscriptUploadAudio } from '../../lib/apiHooks';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { UploadCloud, CheckCircle2 } from 'lucide-react';

interface UploadViewProps {
  transcriptId: string;
}

export function UploadView({ transcriptId }: UploadViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useTranscriptUploadAudio();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    const maxChunkSize = 50 * 1024 * 1024; // 50 MB
    const totalChunks = Math.ceil(file.size / maxChunkSize);
    let chunkNumber = 0;
    let start = 0;
    let uploadedSize = 0;

    const uploadNextChunk = async () => {
      if (chunkNumber === totalChunks) {
        setProgress(100);
        return;
      }

      const chunkSize = Math.min(maxChunkSize, file.size - start);
      const end = start + chunkSize;
      const chunk = file.slice(start, end);

      try {
        const formData = new FormData();
        formData.append("chunk", chunk, file.name);

        await uploadMutation.mutateAsync({
          params: {
            path: {
              transcript_id: transcriptId as any,
            },
            query: {
              chunk_number: chunkNumber,
              total_chunks: totalChunks,
            },
          },
          body: formData as any,
        });

        uploadedSize += chunkSize;
        const currentProgress = Math.floor((uploadedSize / file.size) * 100);
        setProgress(currentProgress);

        chunkNumber++;
        start = end;

        await uploadNextChunk();
      } catch (err: any) {
        console.error(err);
        setError("Failed to upload file. Please try again.");
        setProgress(0);
      }
    };

    uploadNextChunk();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] w-full max-w-2xl mx-auto px-6">
      <div className="w-full text-center space-y-4 mb-8">
        <h2 className="font-serif font-bold text-3xl text-on-surface">Upload Meeting Audio</h2>
        <p className="text-on-surface-variant text-[0.9375rem]">
          Select an audio or video file to generate an editorial transcript.
        </p>
      </div>

      <div className="w-full bg-surface-low border-2 border-dashed border-outline-variant/30 rounded-xl p-12 flex flex-col items-center justify-center text-center space-y-6 transition-colors hover:border-primary/50 hover:bg-surface-low/80">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-2">
          {progress === 100 ? <CheckCircle2 className="w-8 h-8 text-green-600" /> : <UploadCloud className="w-8 h-8" />}
        </div>
        
        {progress > 0 && progress < 100 ? (
          <div className="w-full max-w-xs space-y-3">
            <div className="flex justify-between text-sm font-medium text-on-surface-variant">
              <span>Uploading...</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 w-full bg-surface-high rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300 rounded-full" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : progress === 100 ? (
          <div className="text-green-700 font-medium text-sm">Upload complete! Processing will begin momentarily.</div>
        ) : (
          <>
            <div>
              <p className="font-semibold text-on-surface mb-1">Click to select a file</p>
              <p className="text-xs text-muted">Supported formats: .mp3, .m4a, .wav, .mp4, .mov, .webm</p>
            </div>
            <Button 
              onClick={triggerFileUpload} 
              variant="primary" 
              className="px-8"
              disabled={progress > 0}
            >
              Select File
            </Button>
            {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          </>
        )}

        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileUpload}
          accept="audio/*,video/mp4,video/webm,video/quicktime"
        />
      </div>
    </div>
  );
}
