export const API = import.meta.env.VITE_API_URL ?? 'https://chem-dop.onrender.com'

export async function postJSON(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail ?? `Request failed (${res.status})`)
  return data
}

export const CALCULATOR_LABELS = {
  emboss: 'EMBOSS', dtaselect: 'DTASelect', solomon: 'Solomon', sillero: 'Sillero',
  rodwell: 'Rodwell', lehninger: 'Lehninger', grimsley: 'Grimsley',
  bjellqvist: 'Bjellqvist', ipc: 'IPC',
}
