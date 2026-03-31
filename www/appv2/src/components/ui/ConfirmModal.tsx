import React, { useEffect } from 'react';
import { Button } from './Button';
import { AlertTriangle, X, Trash2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onClose,
  isDestructive = true,
  isLoading = false,
}: ConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isLoading]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#1b1c14]/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={() => !isLoading && onClose()}
      />
      
      {/* Modal Box */}
      <div className="relative w-full max-w-md bg-surface shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200 border border-outline-variant/20">
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 p-2 text-muted hover:text-on-surface hover:bg-surface-high rounded-full transition-colors"
          disabled={isLoading}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 pt-8">
          <div className="flex gap-4 items-start">
            <div className={`p-3 rounded-full shrink-0 ${isDestructive ? 'bg-red-50 text-red-500' : 'bg-primary/10 text-primary'}`}>
              {isDestructive ? <Trash2 className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            
            <div className="space-y-2 mt-1 pr-6">
              <h2 className="text-xl font-serif font-bold text-on-surface">{title}</h2>
              <p className="text-[0.9375rem] font-sans text-on-surface-variant leading-relaxed">
                {description}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 bg-surface-low border-t border-outline-variant/10 flex flex-col-reverse sm:flex-row items-center justify-end gap-3 rounded-b-2xl">
          <Button
            variant="secondary"
            className="w-full sm:w-auto px-5 py-2 hover:bg-surface-highest transition-colors"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={isDestructive ? "secondary" : "primary"}
            className={
              isDestructive 
               ? "w-full sm:w-auto px-5 py-2 !bg-red-50 !text-red-600 border border-red-200 hover:!bg-red-500 hover:!text-white hover:border-red-600 transition-colors shadow-sm" 
               : "w-full sm:w-auto px-5 py-2"
            }
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
