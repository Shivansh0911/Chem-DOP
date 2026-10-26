// Default to the same origin: in the single-service deploy FastAPI serves this
// page, so relative URLs always hit the right backend even if the service is
// renamed. `npm run dev` works too — vite.config.js proxies the API paths to
// localhost:8000. Set VITE_API_URL only to point at some other backend.
export const API = import.meta.env.VITE_API_URL ?? ''

async function unwrap(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail ?? `Request failed (${res.status})`)
  return data
}

export async function postJSON(path, body) {
  return unwrap(await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

export async function getJSON(path) {
  return unwrap(await fetch(`${API}${path}`))
}

export const CALCULATOR_LABELS = {
  emboss: 'EMBOSS', dtaselect: 'DTASelect', solomon: 'Solomon', sillero: 'Sillero',
  rodwell: 'Rodwell', lehninger: 'Lehninger', grimsley: 'Grimsley',
  bjellqvist: 'Bjellqvist', ipc: 'IPC',
}

// Download text the browser already has, without a server round trip.
export function downloadText(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
