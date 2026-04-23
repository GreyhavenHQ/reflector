import type { AuthProviderProps } from 'react-oidc-context'
import { WebStorageStateStore } from 'oidc-client-ts'
import { env, oidcEnabled } from '@/lib/env'

export { oidcEnabled }

export function buildOidcConfig(): AuthProviderProps | null {
  if (!oidcEnabled) return null
  const redirectUri = `${window.location.origin}/v2/auth/callback`
  const silentRedirectUri = `${window.location.origin}/v2/auth/silent-renew`
  const postLogoutRedirectUri = `${window.location.origin}/v2/`
  return {
    authority: env.oidcAuthority,
    client_id: env.oidcClientId,
    redirect_uri: redirectUri,
    silent_redirect_uri: silentRedirectUri,
    post_logout_redirect_uri: postLogoutRedirectUri,
    scope: env.oidcScope,
    response_type: 'code',
    loadUserInfo: true,
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    onSigninCallback: () => {
      window.history.replaceState({}, document.title, '/v2/')
    },
  }
}
