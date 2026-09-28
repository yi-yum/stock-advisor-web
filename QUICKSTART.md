# 股票分析系統 - Next.js 前端快速開始

## 專案結構

```
stock-advisor-web/
├── src/
│   ├── app/              # Next.js App Router 應用程式
│   │   ├── layout.tsx    # 根布局（包含Sidebar）
│   │   ├── page.tsx      # 首頁（重導向到 /analyze）
│   │   ├── globals.css   # 全域樣式
│   │   ├── analyze/      # 股票分析頁面
│   │   ├── watchlist/    # 自選股頁面
│   │   ├── alerts/       # 價格警示頁面
│   │   ├── backtest/     # 策略回測頁面
│   │   ├── sector/       # 板塊掃描頁面
│   │   ├── btc/          # BTC 短線頁面
│   │   ├── sentiment/    # 社群情緒頁面
│   │   └── history/      # 歷史紀錄頁面
│   ├── components/       # React 元件
│   │   ├── layout/
│   │   │   └── Sidebar.tsx          # 左側導航欄
│   │   └── ui/                      # 可重用 UI 元件
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Input.tsx
│   │       └── Spinner.tsx
│   └── lib/
│       └── api.ts        # FastAPI 客戶端
├── package.json          # 專案依賴
├── tsconfig.json         # TypeScript 配置
├── tailwind.config.ts    # Tailwind CSS 配置
├── next.config.js        # Next.js 配置
├── postcss.config.js     # PostCSS 配置
├── .env.local            # 環境變數（NEXT_PUBLIC_API_URL）
└── .eslintrc.json        # ESLint 配置
```

## 安裝與運行

### 1. 安裝依賴
```bash
cd C:\Users\User\stock-advisor-web
npm install
```

### 2. 啟動開發伺服器
```bash
npm run dev
```

預設會在 `http://localhost:3000` 運行

### 3. 構建生產版本
```bash
npm run build
npm start
```

## 環境變數

編輯 `.env.local` 檔案：
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 核心元件

### API 客戶端 (`src/lib/api.ts`)
所有 FastAPI 後端呼叫都已實現：
- **股票分析**: `fetchStockData()`, `analyzeStock()`
- **自選股**: `fetchWatchlist()`, `addToWatchlist()`, `removeFromWatchlist()`, `scanWatchlist()`
- **價格警示**: `fetchAlerts()`, `addAlert()`, `removeAlert()`, `checkAlerts()`
- **BTC**: `fetchBtcShort()`, `analyzeBtc()`
- **板塊**: `scanSectors()`
- **回測**: `runBacktest()`
- **選擇權**: `fetchOptions()`
- **TWSE**: `fetchTwseInstitutional()`, `fetchTwseMargin()`, `fetchTwseRealtime()`, `fetchTwseMarketStatus()`

### 頁面

#### 分析頁面 (`/analyze`)
- 已實現功能：輸入股票代號、呼叫分析API、展示結果（JSON 格式）
- 下一步：美化結果展示、添加圖表

#### 其他頁面
- 各頁面都有對應的導航菜單項
- 目前展示「開發中」訊息
- 可逐步實現功能

## 技術棧

- **框架**: Next.js 14
- **語言**: TypeScript 5
- **樣式**: Tailwind CSS 3
- **UI 元件庫**: Lucide React
- **HTTP 客戶端**: Axios
- **圖表**: Recharts（預留）

## 開發注意事項

1. **API 配置**: 確保 FastAPI 後端在 `http://localhost:8000` 運行
2. **CORS**: 後端需要啟用 CORS 以允許來自 `http://localhost:3000` 的請求
3. **'use client'**: 使用狀態的頁面需要 `'use client'` 指令（已添加）
4. **路徑別名**: 所有匯入都使用 `@/` 前綴（已配置在 `tsconfig.json`）

## 下一步

1. 實現各頁面的功能
2. 美化分析結果顯示（使用 Recharts 添加圖表）
3. 實現實時數據刷新
4. 添加錯誤邊界和異常處理
5. 部署到生產環境

## 故障排除

### 無法連接到後端
- 確認 FastAPI 伺服器已啟動：`http://localhost:8000`
- 檢查 `.env.local` 中的 `NEXT_PUBLIC_API_URL`

### TypeScript 錯誤
- 運行 `npm run build` 驗證錯誤
- 檢查 `tsconfig.json` 配置

### Tailwind CSS 未套用
- 清除 `.next` 目錄：`rm -r .next`
- 重新啟動開發伺服器

---

**作者**: Claude Code  
**建立日期**: 2026-09-13
