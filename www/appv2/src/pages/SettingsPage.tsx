import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '../lib/AuthProvider';
import { useApiKeysList, useApiKeyCreate, useApiKeyRevoke } from '../lib/apiHooks';
import { Button } from '../components/ui/Button';
import { 
  Bell, 
  KeyRound, 
  ShieldCheck, 
  Code2, 
  ArrowRight,
  Plus
} from 'lucide-react';

interface ApiKeyForm {
  keyName: string;
}

interface NewKeyData {
  name: string;
  key: string;
}

export default function SettingsPage() {
  const auth = useAuth();
  const user = auth.status === 'authenticated' ? auth.user : null;
  
  const { data: keysData } = useApiKeysList();
  const createKeyMutation = useApiKeyCreate();
  const revokeKeyMutation = useApiKeyRevoke();

  const apiKeys = keysData || [];
  const [isCreating, setIsCreating] = useState(false);
  const [newKey, setNewKey] = useState<NewKeyData | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ApiKeyForm>();

  const onSubmit = (data: ApiKeyForm) => {
    createKeyMutation.mutate({ body: { name: data.keyName } }, {
      onSuccess: (response) => {
        setNewKey({ name: response.name || data.keyName, key: response.key });
        reset();
        setIsCreating(false);
      }
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Key copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="flex-1 bg-surface flex flex-col font-sans text-on-surface selection:bg-primary-fixed">
      {/* Content Area */}
      <main className="flex-1 w-full max-w-[860px] mx-auto px-[24px] py-[40px]">
        
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="font-serif text-[2rem] font-bold text-[#1b1c14] leading-tight mb-1">API Keys</h1>
          <p className="font-sans text-[0.9375rem] text-[#a09a8e]">
            Manage your API keys to authenticate with the Editorial Archive API. Keep these keys secure and never share them publicly.
          </p>
        </div>

        {/* Create New API Key Card */}
        <div className="bg-[#FFFFFF] rounded-[12px] p-[20px] md:px-[24px] shadow-[0_4px_24px_rgba(27,28,20,0.06)] mb-8">
          {!isCreating ? (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="font-serif text-[1.25rem] font-bold text-[#1b1c14] mb-1">Create New API Key</h2>
                <p className="font-sans text-[0.9375rem] text-[#5a5850]">
                  Generate a new secret token to access our archival endpoints.
                </p>
              </div>
              <button 
                onClick={() => { setIsCreating(true); setNewKey(null); }}
                className="shrink-0 bg-gradient-to-br from-[#a63500] to-[#c84c1a] text-white font-sans font-semibold text-[0.9375rem] px-[18px] py-[8px] rounded-[6px] hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Create API Key
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col md:flex-row md:items-start gap-4">
              <div className="flex-1">
                <label className="block font-sans text-[0.8125rem] font-bold text-[#1b1c14] mb-1.5 uppercase tracking-wider">Key Name</label>
                <input 
                  type="text"
                  {...register('keyName', { required: true, minLength: 3 })}
                  placeholder="e.g., Production Server"
                  className="w-full bg-[#f6f4e7] border border-outline-variant/20 rounded-[6px] px-3 py-2 text-[0.9375rem] text-[#1b1c14] focus:outline-none focus:ring-1 focus:ring-[#DC5A28] focus:border-[#DC5A28] transition-all"
                  autoFocus
                />
                {errors.keyName && <p className="text-[#ba1a1a] text-xs mt-1.5">Name is required (min 3 characters).</p>}
              </div>
              <div className="flex items-center gap-2 md:mt-[26px]">
                <Button type="button" variant="secondary" onClick={() => { setIsCreating(false); reset(); }}>Cancel</Button>
                <button 
                  type="submit"
                  className="bg-gradient-to-br from-[#a63500] to-[#c84c1a] text-white font-sans font-semibold text-[0.9375rem] px-[18px] py-[8px] rounded-[6px] hover:opacity-90 transition-opacity"
                >
                  Generate Key
                </button>
              </div>
            </form>
          )}
        </div>

        {newKey && (
          <div className="mt-8 bg-surface-high border border-[#DC5A28]/30 rounded-[12px] p-[24px] shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-[#DC5A28]/10 rounded-full mt-1">
                <KeyRound className="w-5 h-5 text-[#DC5A28]" />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-[1.125rem] font-bold text-[#1b1c14] mb-1">
                  API Key Created: {newKey.name}
                </h3>
                <p className="font-sans text-[0.9375rem] text-[#DC5A28] font-medium mb-4">
                  Make sure to copy your personal access token now. You won't be able to see it again!
                </p>
                <div className="flex items-center gap-2">
                  <div className="bg-[#f0eee1] px-4 py-3 rounded-[6px] flex-1 font-mono text-[0.9375rem] text-[#1b1c14] overflow-x-auto border border-outline-variant/10">
                    {newKey.key}
                  </div>
                  <button 
                    onClick={() => copyToClipboard(newKey.key)}
                    className="shrink-0 bg-[#E5E2D9] text-[#1b1c14] font-sans font-semibold text-[0.875rem] px-[16px] py-[10px] rounded-[6px] hover:bg-[#D5D2C9] transition-colors"
                  >
                    Copy Key
                  </button>
                </div>
              </div>
              <button 
                onClick={() => setNewKey(null)}
                className="text-muted hover:text-primary p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Your API Keys Section */}
        <div className="mt-[32px]">
          <h2 className="font-serif text-[1.25rem] font-bold text-[#1b1c14] mb-4">Your API Keys</h2>
          
          {apiKeys.length === 0 ? (
            /* Empty State */
            <div className="bg-[#f6f4e7] rounded-[12px] p-[48px] px-[24px] flex flex-col items-center justify-center text-center">
              <KeyRound className="w-10 h-10 text-[#C8C8BE] mb-4" />
              <p className="font-serif italic text-[1rem] text-[#a09a8e] mb-2">No API keys yet.</p>
              <p className="font-sans text-[0.9375rem] text-[#a09a8e] max-w-md">
                You haven't generated any keys yet. Create one above to start curating your archive via API.
              </p>
            </div>
          ) : (
            /* Table View */
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="font-sans text-[0.75rem] font-bold text-[#a09a8e] uppercase tracking-wider pb-3 px-4 font-normal">Name</th>
                    <th className="font-sans text-[0.75rem] font-bold text-[#a09a8e] uppercase tracking-wider pb-3 px-4 font-normal">Id</th>
                    <th className="font-sans text-[0.75rem] font-bold text-[#a09a8e] uppercase tracking-wider pb-3 px-4 font-normal">Created</th>
                    <th className="font-sans text-[0.75rem] font-bold text-[#a09a8e] uppercase tracking-wider pb-3 px-4 font-normal text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="group hover:bg-[#f6f4e7] transition-colors border-t border-outline-variant/10">
                      <td className="py-4 px-4 font-sans text-[0.9375rem] font-semibold text-[#1b1c14]">{key.name}</td>
                      <td className="py-4 px-4">
                        <span className="font-mono text-[0.8125rem] text-[#5a5850] bg-[#f0eee1] rounded-[6px] px-[8px] py-[2px]">
                          ...{key.id.slice(-6)}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-sans text-[0.9375rem] text-[#5a5850]">{new Date(key.created_at).toLocaleDateString()}</td>
                      <td className="py-4 px-4 text-right">
                        <button 
                          onClick={() => {
                            if (confirm('Are you sure you want to revoke this key?')) {
                              revokeKeyMutation.mutate({ params: { path: { key_id: key.id } } });
                            }
                          }}
                          className="font-sans text-[0.9375rem] font-medium text-[#DC5A28] hover:underline transition-all"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bottom Info Cards Row */}
        <div className="mt-[32px] grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Card 1 — Security Best Practices */}
          <div className="bg-[#FFFFFF] rounded-[12px] p-[24px] shadow-[0_4px_24px_rgba(27,28,20,0.04)] border border-outline-variant/10">
            <ShieldCheck className="w-6 h-6 text-[#DC5A28] mb-4" />
            <h3 className="font-serif text-[1.25rem] font-bold text-[#1b1c14] mb-3">Security Best Practices</h3>
            <ul className="space-y-2 font-sans text-[0.9375rem] text-[#5a5850]">
              <li className="flex gap-2">
                <span className="text-[#DC5A28] mt-0.5">•</span>
                <span>Never commit your API keys to version control systems like GitHub.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#DC5A28] mt-0.5">•</span>
                <span>Rotate your keys every 90 days to minimize risk of exposure.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-[#DC5A28] mt-0.5">•</span>
                <span>Use environment variables to store your keys in production.</span>
              </li>
            </ul>
          </div>

          {/* Card 2 — API Documentation */}
          <div className="bg-[#FFFFFF] rounded-[12px] p-[24px] shadow-[0_4px_24px_rgba(27,28,20,0.04)] border border-outline-variant/10 flex flex-col">
            <Code2 className="w-6 h-6 text-[#DC5A28] mb-4" />
            <h3 className="font-serif text-[1.25rem] font-bold text-[#1b1c14] mb-3">API Documentation</h3>
            <p className="font-sans text-[0.9375rem] text-[#5a5850] mb-6 flex-1">
              Learn how to integrate the Editorial Archive into your workflow with our comprehensive guides.
            </p>
            <a 
              href="#" 
              className="inline-flex items-center gap-1 font-sans text-[0.9375rem] font-semibold text-[#DC5A28] hover:text-[#a63500] transition-colors"
            >
              View Documentation <ArrowRight className="w-4 h-4" />
            </a>
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
    </div>
  );
}
