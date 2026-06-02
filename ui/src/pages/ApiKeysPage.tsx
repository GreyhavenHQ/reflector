import { useState } from 'react'
import { toast } from 'sonner'
import { SettingsShell } from '@/components/layout/SettingsShell'
import { ConfirmDialog } from '@/components/browse/ConfirmDialog'
import { Button } from '@/components/ui/primitives'
import { I } from '@/components/icons'
import {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  type ApiKey,
  type ApiKeyWithSecret,
} from '@/hooks/useApiKeys'
import { fmtDate } from '@/lib/format'
import { messageFor } from '@/lib/apiErrors'

export function ApiKeysPage() {
  const { data: keys = [], isLoading, isError } = useApiKeys()
  const create = useCreateApiKey()
  const destroy = useDeleteApiKey()

  const [createOpen, setCreateOpen] = useState(false)
  const [revealed, setRevealed] = useState<ApiKeyWithSecret | null>(null)
  const [deleting, setDeleting] = useState<ApiKey | null>(null)

  return (
    <SettingsShell title="Settings" crumb={['settings', 'api-keys']}>
      <div className="bg-card border border-border rounded-lg shadow-xs overflow-hidden">
        <header className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="m-0 font-serif text-xl font-semibold tracking-[-0.015em] text-fg">
              API Keys
            </h1>
            <p className="mt-1 mb-0 text-[12.5px] text-fg-muted font-sans">
              Programmatic access to Reflector. Send the key as the{' '}
              <code className="font-mono text-[11.5px] px-1 py-px bg-muted rounded-[3px]">
                X-API-Key
              </code>{' '}
              header.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            {I.Plus(13)} New API key
          </Button>
        </header>

        <div className="px-5">
          {isLoading ? (
            <div className="p-8 text-center text-fg-muted font-sans text-[13px]">
              Loading keys…
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-destructive font-sans text-[13px]">
              Failed to load keys.
            </div>
          ) : keys.length === 0 ? (
            <EmptyState onCreate={() => setCreateOpen(true)} />
          ) : (
            <table className="w-full border-collapse font-sans text-[13px]">
              <thead>
                <tr className="text-left text-fg-muted text-[11px] tracking-[0.03em] uppercase">
                  <th className="py-2.5 font-semibold">Name</th>
                  <th className="py-2.5 font-semibold">Created</th>
                  <th className="py-2.5 font-semibold w-10" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t border-border">
                    <td className="py-3 text-fg font-medium">
                      {k.name || <span className="text-fg-muted">Unnamed</span>}
                    </td>
                    <td className="py-3 text-fg-muted font-mono text-[11.5px]">
                      {fmtDate(k.created_at)}
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Delete key"
                        aria-label="Delete key"
                        onClick={() => setDeleting(k)}
                      >
                        {I.Trash(14)}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {createOpen && (
        <CreateKeyDialog
          saving={create.isPending}
          onClose={() => setCreateOpen(false)}
          onCreate={async (name) => {
            try {
              const result = await create.mutateAsync({ name })
              setCreateOpen(false)
              setRevealed(result)
            } catch (err) {
              toast.error(messageFor(err, 'Failed to create API key'))
            }
          }}
        />
      )}

      {revealed && (
        <RevealKeyDialog
          apiKey={revealed}
          onClose={() => setRevealed(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete API key?"
          message={
            <>
              <strong className="text-fg">
                {deleting.name || 'Unnamed key'}
              </strong>{' '}
              will be revoked immediately. Any service using it will start to fail.
            </>
          }
          confirmLabel="Delete key"
          danger
          loading={destroy.isPending}
          onConfirm={async () => {
            const target = deleting
            setDeleting(null)
            try {
              await destroy.mutateAsync(target.id)
              toast.success('API key deleted')
            } catch (err) {
              toast.error(messageFor(err, 'Failed to delete API key'))
            }
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </SettingsShell>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-5 py-12 text-center font-sans">
      <div className="text-fg-muted inline-flex mb-3">
        {I.Shield(28)}
      </div>
      <div className="text-[15px] font-semibold text-fg mb-1">
        No API keys yet
      </div>
      <p className="mx-auto mt-0 mb-4 max-w-[380px] text-[13px] text-fg-muted leading-[1.5]">
        Generate one to start calling the Reflector API from your own scripts or services.
      </p>
      <Button variant="primary" size="sm" onClick={onCreate}>
        {I.Plus(13)} Create your first key
      </Button>
    </div>
  )
}

function CreateKeyDialog({
  saving,
  onClose,
  onCreate,
}: {
  saving: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')

  return (
    <div className="rf-modal-backdrop" onClick={onClose}>
      <div
        className="rf-modal w-[440px] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-border flex items-center">
          <h2 className="m-0 font-serif text-lg font-semibold tracking-[-0.01em] text-fg flex-1">
            New API key
          </h2>
        </header>
        <div className="p-5 flex flex-col gap-3 font-sans text-[13px]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-fg">
              Name
            </span>
            <input
              className="rf-input"
              type="text"
              placeholder="e.g. production ingest"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !saving) {
                  e.preventDefault()
                  void onCreate(name)
                }
              }}
              disabled={saving}
            />
            <span className="text-[11.5px] text-fg-muted">
              Optional — helps you remember what this key is for.
            </span>
          </label>
        </div>
        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void onCreate(name)}
            disabled={saving}
          >
            {saving ? 'Creating…' : 'Create key'}
          </Button>
        </footer>
      </div>
    </div>
  )
}

function RevealKeyDialog({
  apiKey,
  onClose,
}: {
  apiKey: ApiKeyWithSecret
  onClose: () => void
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey.key)
      toast.success('Key copied')
    } catch {
      toast.error('Could not copy key')
    }
  }

  return (
    <div className="rf-modal-backdrop" onClick={onClose}>
      <div
        className="rf-modal w-[520px] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-border">
          <h2 className="m-0 font-serif text-lg font-semibold tracking-[-0.01em] text-fg">
            API key created
          </h2>
        </header>
        <div className="p-5 flex flex-col gap-3 font-sans text-[13px] leading-[1.5]">
          <p className="m-0 text-fg">
            Copy this key now. <strong>It won't be shown again.</strong>
          </p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 min-w-0 px-3 py-2.5 font-mono text-xs bg-muted border border-border rounded-md break-all text-fg">
              {apiKey.key}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copy}
              className="shrink-0"
            >
              {I.Copy(13)} Copy
            </Button>
          </div>
          <p className="m-0 text-xs text-fg-muted">
            Use it as the <code className="font-mono">X-API-Key</code>{' '}
            header on every request.
          </p>
        </div>
        <footer className="px-5 py-3 border-t border-border flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  )
}
