# 🍶 次、どこ行く？ - IZAKAYA FINDER

飲み会の二次会・三次会の行き先を、AIが現在地から瞬時に提案してくれるWebアプリ。

## Features

- 📍 **位置情報ベース** - 現在地から徒歩8分圏内の居酒屋を自動検索
- ⭐ **品質フィルタ** - Google評価3.8以上の店のみ表示
- 🕐 **営業中限定** - Google Mapsの営業時間をもとに、今やっている店だけを表示
- 🤖 **AIランキング** - Claude が条件にマッチする順にランキング生成
- 📱 **スマホ最適化** - 飲み会中にサッと使えるモバイルファーストUI

### 検索条件

| 条件 | 選択肢 | 備考 |
|------|--------|------|
| 喫煙 | こだわらない / 喫煙OK / 禁煙 | ※Google APIでは喫煙情報取得不可。AI参考情報として利用 |
| 予算 | 安い / 普通 / 良い店（複数選択可） | Google price_level で判定 |
| 人数 | 数人(2-4) / 8人くらい(5-10) / 大人数(10+) | レビュー数からキャパ推定 |

### 大前提（自動適用）

- 居酒屋のみ
- 徒歩8分以内（半径640m）
- Google評価3.8以上（高評価順）
- **今やっているお店のみ**

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Places**: Google Maps JavaScript API (Places Library)
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Deploy**: Vercel / Netlify / etc.

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/yourname/izakaya-finder.git
cd izakaya-finder
npm install
```

### 2. APIキーの取得

#### Google Maps API Key

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクト作成
2. 以下のAPIを有効化:
   - **Maps JavaScript API**
   - **Places API**
3. 「認証情報」からAPIキーを作成
4. APIキーの制限を設定（推奨）:
   - アプリケーション制限: HTTPリファラー
   - API制限: Maps JavaScript API, Places API のみ

#### Anthropic API Key

1. [Anthropic Console](https://console.anthropic.com/) でアカウント作成
2. APIキーを発行

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集:

```
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

### 4. index.html の修正

`index.html` の Google Maps script タグのAPIキーを書き換え:

```html
<script
  src="https://maps.googleapis.com/maps/api/js?key=AIzaSy...&libraries=places&language=ja"
  async
  defer
></script>
```

### 5. 起動

```bash
npm run dev
```

スマホからアクセスする場合（位置情報テストに便利）:

```
http://[PCのローカルIP]:5173
```

> ⚠️ HTTPS でないと位置情報APIが動作しないブラウザがあります。
> ローカル開発時は `vite --https` または ngrok 等を使ってください。

## Project Structure

```
src/
├── main.tsx              # エントリポイント
├── App.tsx               # メインコンポーネント（UI全体）
├── types.ts              # TypeScript 型定義
├── vite-env.d.ts         # Vite 環境変数の型
└── lib/
    ├── google-places.ts  # Google Places API ラッパー
    ├── ai-ranking.ts     # Claude AI ランキング生成
    └── utils.ts          # ユーティリティ関数
```

## API Usage & Cost

### Google Maps Platform

- Nearby Search: $32 / 1,000リクエスト
- Place Details: $17 / 1,000リクエスト（Basic fields）
- 月$200の無料枠あり（≒ 約6,000回の検索）

### Anthropic Claude API

- Claude Sonnet: 入力 $3 / 出力 $15 per 1M tokens
- 1回の検索 ≒ ~2,000 tokens ≒ $0.01以下

## Notes

- **喫煙情報**: Google Places API では取得できません。将来的にホットペッパーグルメAPI等との連携で対応可能です
- **キャパシティ**: Google API にはキャパ情報がないため、レビュー数から推定しています
- **営業時間**: Google Maps の `opening_hours` を使用。臨時休業等には対応していません
- **距離計算**: 直線距離 × 1.3 で徒歩距離を概算しています（Google Distance Matrix API で正確化可能）

## Future Improvements

- [ ] ホットペッパーグルメAPI連携（喫煙情報・クーポン・空席状況）
- [ ] Google Distance Matrix API で正確な徒歩時間
- [ ] LINEシェア機能（「次ここ行こう！」をグループに送る）
- [ ] お気に入り・履歴機能
- [ ] PWA対応（ホーム画面に追加）

## License

MIT
