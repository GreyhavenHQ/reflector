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
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xs)',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif)',
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: '-0.015em',
                color: 'var(--fg)',
              }}
            >
              API Keys
            </h1>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 12.5,
                color: 'var(--fg-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Programmatic access to Reflector. Send the key as the{' '}
              <code
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  padding: '1px 4px',
                  background: 'var(--muted)',
                  borderRadius: 3,
                }}
              >
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

        <div style={{ padding: '0 20px' }}>
          {isLoading ? (
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                color: 'var(--fg-muted)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
              }}
            >
              Loading keys…
            </div>
          ) : isError ? (
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                color: 'var(--destructive)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
              }}
            >
              Failed to load keys.
            </div>
          ) : keys.length === 0 ? (
            <EmptyState onCreate={() => setCreateOpen(true)} />
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: 'left',
                    color: 'var(--fg-muted)',
                    fontSize: 11,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={{ padding: '10px 0', fontWeight: 600 }}>Name</th>
                  <th style={{ padding: '10px 0', fontWeight: 600 }}>Created</th>
                  <th style={{ padding: '10px 0', fontWeight: 600, width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr
                    key={k.id}
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <td
                      style={{
                        padding: '12px 0',
                        color: 'var(--fg)',
                        fontWeight: 500,
                      }}
                    >
                      {k.name || <span style={{ color: 'var(--fg-muted)' }}>Unnamed</span>}
                    </td>
                    <td
                      style={{
                        padding: '12px 0',
                        color: 'var(--fg-muted)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                      }}
                    >
                      {fmtDate(k.created_at)}
                    </td>
                    <td style={{ padding: '12px 0', textAlign: 'right' }}>
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
              <strong style={{ color: 'var(--fg)' }}>
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
    <div
      style={{
        padding: '48px 20px',
        textAlign: 'center',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        style={{
          color: 'var(--fg-muted)',
          display: 'inline-flex',
          marginBottom: 12,
        }}
      >
        {I.Shield(28)}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--fg)',
          marginBottom: 4,
        }}
      >
        No API keys yet
      </div>
      <p
        style={{
          margin: '0 auto 16px',
          maxWidth: 380,
          fontSize: 13,
          color: 'var(--fg-muted)',
          lineHeight: 1.5,
        }}
      >
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
        className="rf-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 440, maxWidth: '92vw' }}
      >
        <header
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--fg)',
              flex: 1,
            }}
          >
            New API key
          </h2>
        </header>
        <div
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: 'var(--fg)',
              }}
            >
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
            <span
              style={{
                fontSize: 11.5,
                color: 'var(--fg-muted)',
              }}
            >
              Optional — helps you remember what this key is for.
            </span>
          </label>
        </div>
        <footer
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
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
        className="rf-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '92vw' }}
      >
        <header
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: 'var(--fg)',
            }}
          >
            API key created
          </h2>
        </header>
        <div
          style={{
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: 0, color: 'var(--fg)' }}>
            Copy this key now. <strong>It won't be shown again.</strong>
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 8,
            }}
          >
            <code
              style={{
                flex: 1,
                minWidth: 0,
                padding: '10px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                background: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                wordBreak: 'break-all',
                color: 'var(--fg)',
              }}
            >
              {apiKey.key}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copy}
              style={{ flexShrink: 0 }}
            >
              {I.Copy(13)} Copy
            </Button>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'var(--fg-muted)',
            }}
          >
            Use it as the <code style={{ fontFamily: 'var(--font-mono)' }}>X-API-Key</code>{' '}
            header on every request.
          </p>
        </div>
        <footer
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  )
}
