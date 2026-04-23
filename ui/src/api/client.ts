import createClient, { type Middleware } from 'openapi-fetch'
import createQueryClient from 'openapi-react-query'
import type { paths } from './schema'

export const PASSWORD_TOKEN_KEY = 'reflector.password_token'

let oidcAccessTokenGetter: (() => string | null) | null = null
export function setOidcAccessTokenGetter(getter: (() => string | null) | null) {
  oidcAccessTokenGetter = getter
}

export function setPasswordToken(token: string | null) {
  if (token) sessionStorage.setItem(PASSWORD_TOKEN_KEY, token)
  else sessionStorage.removeItem(PASSWORD_TOKEN_KEY)
}

export function getPasswordToken() {
  return sessionStorage.getItem(PASSWORD_TOKEN_KEY)
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = oidcAccessTokenGetter?.() ?? getPasswordToken()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
}

export const apiClient = createClient<paths>({ baseUrl: '/' })
apiClient.use(authMiddleware)

export const $api = createQueryClient(apiClient)
