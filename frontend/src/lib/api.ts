export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const TOKEN_KEY = 'loomiq.token'

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(t: string | null) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable */ }
}

let onUnauthorized: () => void = () => {}
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn }

function message(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    if ('detail' in body) {
      const d = (body as { detail: unknown }).detail
      if (typeof d === 'string') return d
      if (Array.isArray(d)) {
        return d.map((e: { loc?: unknown[]; msg?: string }) => {
          const field = (e.loc ?? []).filter((x) => x !== 'body').join('.')
          return field ? `${field}: ${e.msg}` : e.msg
        }).join('; ')
      }
    }
    if ('message' in body && typeof (body as { message: unknown }).message === 'string') {
      return (body as { message: string }).message
    }
  }
  if (typeof body === 'string' && body.trim()) return body
  if (status === 401) return 'Incorrect username or password.'
  if (status === 403) return 'You do not have permission to access this resource.'
  if (status >= 500) return 'The server hit an error. Try again; if it repeats, check the backend log.'
  return `Request failed (${status})`
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body) }
  let res: Response
  try {
    res = await fetch(path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body })
  } catch {
    throw new ApiError(0, 'Cannot reach the LoomIQ server. Check that the backend is running.')
  }
  const text = await res.text()
  const data = text ? (() => { try { return JSON.parse(text) } catch { return text } })() : null
  if (!res.ok) {
    if (res.status === 401 && opts.auth !== false && !path.endsWith('/auth/login')) onUnauthorized()
    throw new ApiError(res.status, message(data, res.status))
  }
  return data as T
}

/** Fetch a protected binary (image/svg) and return an object URL. */
export async function blobUrl(path: string): Promise<string> {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
  if (!res.ok) throw new ApiError(res.status, 'Could not load file')
  return URL.createObjectURL(await res.blob())
}
