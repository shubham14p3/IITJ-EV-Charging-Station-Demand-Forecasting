import axios from 'axios'

const BASE = import.meta.env.VITE_API_BASE || 'http://51.20.36.32:8000'

export async function uploadCsv(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await axios.post(`${BASE}/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return res.data
}

export async function ingestJson(json: any) {
  const res = await axios.post(`${BASE}/ingest-json`, json)
  return res.data
}

export async function getRaw(limit = 100) {
  const res = await axios.get(`${BASE}/raw`, { params: { limit } })
  return res.data
}
export async function getRawFilled(limit = 100) {
  const res = await axios.get(`${BASE}/raw_filled`, { params: { limit } })
  return res.data
}

export async function getClean(freq: 'H' | 'D', site?: string | null, limit = 200) {
  const res = await axios.get(`${BASE}/clean`, { params: { freq, site, limit } })
  return res.data
}

export async function getSeries(freq: 'H' | 'D', site?: string | null) {
  const res = await axios.get(`${BASE}/series`, { params: { freq, site } })
  return res.data
}

export type ForecastReq = {
  site?: string | null
  metric: 'energy' | 'sessions'
  freq: 'H' | 'D'
  seasonal_period: number
  horizon: number
  test_size: number
  auto_grid: boolean
  order?: [number, number, number]
  seasonal_order?: [number, number, number, number]
}

export async function forecast(body: ForecastReq) {
  const res = await axios.post(`${BASE}/forecast`, body)
  return res.data
}

export async function diagnostics(metric: 'energy' | 'sessions', freq: 'H' | 'D', site?: string | null, nlags = 40) {
  const res = await axios.get(`${BASE}/diagnostics`, { params: { metric, freq, site, nlags } })
  return res.data
}

export function downloadForecastCsv() {
  window.open(`${BASE}/download/forecast.csv`, '_blank')
}
