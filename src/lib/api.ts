import axios, { AxiosInstance } from 'axios'

// 開發時直接打後端；外網透過 Next.js proxy（next.config.js rewrites）轉發
const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
})

// ── 股票分析 ──────────────────────────────────────────
export async function fetchStockData(symbol: string): Promise<any> {
  const res = await api.get(`/api/stock/${symbol}`)
  return res.data
}

// ── 自選股 ────────────────────────────────────────────
export async function fetchWatchlist(): Promise<any[]> {
  const res = await api.get('/api/watchlist')
  return res.data
}

export async function addToWatchlist(symbol: string, note?: string): Promise<any> {
  const res = await api.post('/api/watchlist', { symbol, note: note ?? '' })
  return res.data
}

export async function removeFromWatchlist(symbol: string): Promise<any> {
  const res = await api.delete(`/api/watchlist/${symbol}`)
  return res.data
}

export async function fetchWatchlistSignals(): Promise<any[]> {
  const res = await api.get('/api/watchlist/signals', { timeout: 120000 })
  return res.data
}

// ── 價格警示 ──────────────────────────────────────────
export async function fetchAlerts(): Promise<any[]> {
  const res = await api.get('/api/alerts')
  return res.data
}

export async function addAlert(
  symbol: string,
  alertType: string,
  price: number,
  note?: string
): Promise<any> {
  const res = await api.post('/api/alerts', {
    symbol,
    alert_type: alertType,
    price,
    note: note ?? '',
  })
  return res.data
}

export async function removeAlert(symbol: string, price: number): Promise<any> {
  const res = await api.delete(`/api/alerts/${symbol}/${price}`)
  return res.data
}

export async function checkAlerts(): Promise<any> {
  const res = await api.post('/api/alerts/check')
  return res.data
}

// ── 回測 ──────────────────────────────────────────────
export async function runBacktestStock(params: {
  symbol: string
  startDate: string
  endDate: string
  strategy: string
}): Promise<any> {
  const res = await api.get('/api/backtest/stock', {
    params: {
      symbol: params.symbol,
      start_date: params.startDate,
      end_date: params.endDate,
      strategy: params.strategy,
    },
  })
  return res.data
}

// ── 加密貨幣 ──────────────────────────────────────────
export async function fetchCryptoStrategyChart(symbol: string, bars: number = 120): Promise<any> {
  const res = await api.get('/api/crypto/strategy-chart', { params: { symbol, bars } })
  return res.data
}

export async function fetchCryptoStrategyStatus(): Promise<any> {
  const res = await api.get('/api/crypto/strategy-status')
  return res.data
}

export async function fetchCryptoSignalHistory(): Promise<any> {
  const res = await api.get('/api/crypto/signal-history')
  return res.data
}

// ── 掃描歷史紀錄 ──────────────────────────────────────
export async function fetchScanHistoryList(): Promise<any> {
  const res = await api.get('/api/scan-history')
  return res.data
}

export async function fetchScanHistoryDetail(filename: string): Promise<any> {
  const res = await api.get('/api/scan-history/detail', { params: { filename } })
  return res.data
}

// ── 板塊資金流向 ──────────────────────────────────────
export async function fetchSectorFlowTw(): Promise<any> {
  const res = await api.get('/api/sector-flow/tw')
  return res.data
}

export async function fetchSectorFlowTwHistory(days: number): Promise<any> {
  const res = await api.get('/api/sector-flow/tw/history', { params: { days } })
  return res.data
}

export async function fetchSectorFlowUs(days: number): Promise<any> {
  const res = await api.get('/api/sector-flow/us', { params: { days } })
  return res.data
}

// ── 每日掃描器 ──────────────────────────────────────────────────────────────
export async function fetchScannerResults(market: string = 'tw'): Promise<any> {
  const res = await api.get('/api/scanner/results', { params: { market } })
  return res.data
}

export async function triggerScan(market: string = 'tw'): Promise<any> {
  const res = await api.post('/api/scanner/run', null, {
    params: { market },
    timeout: 600000,
  })
  return res.data
}

export async function fetchScannerStatus(): Promise<any> {
  const res = await api.get('/api/scanner/status')
  return res.data
}

export async function fetchDailySummary(): Promise<any> {
  const res = await api.get('/api/scanner/daily-summary')
  return res.data
}

export async function fetchMarketState(): Promise<any> {
  const res = await api.get('/api/scanner/market-state')
  return res.data
}

export async function fetchSymbolHistory(symbol: string, market: string = 'tw'): Promise<any> {
  const res = await api.get(`/api/scanner/history/symbol/${encodeURIComponent(symbol)}`, { params: { market } })
  return res.data
}

export function getScannerChartUrl(symbol: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || ''
  return `${base}/api/scanner/chart/${encodeURIComponent(symbol)}`
}

// ── 掃描追蹤器 ────────────────────────────────────────────────────────────────
export async function fetchTrackerOpen(market?: string): Promise<any> {
  const res = await api.get('/api/scanner/tracker/open', { params: market ? { market } : {} })
  return res.data
}

export async function fetchTrackerClosed(market?: string, limit = 100): Promise<any> {
  const res = await api.get('/api/scanner/tracker/closed', { params: { ...(market ? { market } : {}), limit } })
  return res.data
}

export async function fetchTrackerSummary(): Promise<any> {
  const res = await api.get('/api/scanner/tracker/summary')
  return res.data
}

export async function closeTrackerPosition(symbol: string, reason = '手動出場'): Promise<any> {
  const res = await api.delete(`/api/scanner/tracker/open/${encodeURIComponent(symbol)}`, { params: { reason } })
  return res.data
}
