import React from 'react';
import { Bot, Sparkles } from 'lucide-react';

export function ProcessingView() {
  return (
    <div className="flex-1 min-h-[500px] w-full max-w-2xl mx-auto px-6 flex flex-col items-center justify-center">
      <div className="relative mb-12">
        <div className="absolute inset-0 w-32 h-32 bg-primary/20 rounded-full blur-2xl animate-pulse" />
        <div className="relative bg-surface p-6 rounded-3xl border border-primary/20 shadow-xl shadow-primary/5 flex items-center justify-center">
          <Bot className="w-12 h-12 text-primary animate-bounce" />
        </div>
      </div>
      
      <div className="text-center space-y-4 max-w-md">
        <h2 className="font-serif font-bold text-3xl text-on-surface">Curating your archive...</h2>
        <p className="text-on-surface-variant text-[0.9375rem] leading-relaxed">
          The Reflector extraction engine is analyzing the audio. This typically takes a few moments depending on the recording length.
        </p>
      </div>

      <div className="mt-12 flex space-x-2">
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
      </div>
    </div>
  );
}
