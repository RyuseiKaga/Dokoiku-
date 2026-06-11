// ============================================================
// HotPepper Gourmet API integration
// JSONP-based browser-side API calls
//
// 注意: グルメサーチAPI v1 にリアルタイム空席情報は存在しない。
// 取得できるのは掲載情報（喫煙・飲み放題・個室・席数・予約ページURL）のみ。
// ============================================================

export interface HpShop {
  id: string;
  name: string;
  urls: { pc: string };
  address: string;
  lat: string;
  lng: string;
  budget?: { code: string; name: string; average: string };
  non_smoking?: string;
  free_drink?: string;
  private_room?: string;
  capacity?: number;
  open?: string;
}

interface HpResponse {
  results: {
    shop?: HpShop[];
    results_available?: number | string;
    results_returned?: number | string;
  };
}

/**
 * HP連携の状態（UI上の診断表示用）
 * configured: APIキーが設定されているか
 * shopCount: 直近の検索で取得できたHP店舗数
 */
export const hpStatus = { configured: false, shopCount: 0 };

/**
 * JSONP call helper for HotPepper API (CORS対策)
 */
function callJsonp(url: string): Promise<HpResponse> {
  return new Promise((resolve, reject) => {
    const cbName = `hp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const script = document.createElement("script");

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("HotPepper API timeout"));
    }, 10000);

    const cleanup = () => {
      clearTimeout(timer);
      delete (window as any)[cbName];
      script.remove();
    };

    (window as any)[cbName] = (data: HpResponse) => {
      cleanup();
      resolve(data);
    };

    script.src = `${url}&callback=${cbName}&format=jsonp`;
    script.onerror = () => {
      cleanup();
      reject(new Error("HotPepper script load error"));
    };
    document.head.appendChild(script);
  });
}

/**
 * ホットペッパーAPI で位置情報周辺の飲食店を検索
 * range=3 → 1000m 圏内、距離順（lat/lng指定時はAPI側で距離順固定）
 *
 * 繁華街では1km圏内に100件を超えるため、最大300件までページング取得する。
 * ジャンルを絞ると「焼き鳥」等のカテゴリ店が漏れるため keyword は指定しない。
 */
export async function searchHotpepper(location: {
  lat: number;
  lng: number;
}): Promise<HpShop[]> {
  const apiKey = import.meta.env.VITE_HOTPEPPER_API_KEY;
  hpStatus.configured = Boolean(apiKey);
  hpStatus.shopCount = 0;
  if (!apiKey) {
    console.warn(
      "[HP] VITE_HOTPEPPER_API_KEY が未設定です。GitHub Secrets / .env を確認してください。HP連携なしで続行します。"
    );
    return [];
  }

  const all: HpShop[] = [];

  for (let start = 1; start <= 201; start += 100) {
    const params = new URLSearchParams({
      key: apiKey,
      lat: String(location.lat),
      lng: String(location.lng),
      range: "3", // 1000m
      count: "100",
      start: String(start),
    });
    const url = `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params}`;

    try {
      const data = await callJsonp(url);
      const shops = data.results.shop ?? [];
      all.push(...shops);

      const returned = Number(data.results.results_returned ?? shops.length);
      if (returned < 100) break; // 最終ページ
    } catch (err) {
      console.warn("HotPepper API error:", err);
      break;
    }
  }

  hpStatus.shopCount = all.length;
  return all;
}

/**
 * 店名を正規化（マッチング精度向上）
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[（）()【】「」『』〔〕]/g, "")
    .replace(/[・、。]/g, "")
    .replace(/(本店|別館|支店|新館|２号店|2号店|店)$/, "");
}

/**
 * 2点間の直線距離（メートル）
 */
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * CJK文字（漢字・ひらがな・カタカナ）のみ抽出
 */
function cjkOnly(s: string): string {
  return s.replace(/[^぀-鿿]/g, "");
}

/**
 * Google Places の店舗に対応する HotPepper shop を探す
 *
 * 全パス「座標で範囲を絞った上で名前で確認」する。
 * 雑居ビル密集地では同一座標に多数の店が重なるため、
 * 座標のみのマッチングは誤連携の危険があり行わない。
 * ここで決まらない曖昧ケースは呼び出し側の AI マッチングに委ねる。
 */
export function matchHpShop(
  googleName: string,
  lat: number,
  lng: number,
  hpShops: HpShop[]
): HpShop | null {
  const normalized = normalizeName(googleName);
  const googleCjk = cjkOnly(normalized);

  // 距離を一度だけ計算し、近い順に並べる
  const withDist = hpShops
    .flatMap((shop) => {
      const hpLat = parseFloat(shop.lat);
      const hpLng = parseFloat(shop.lng);
      if (isNaN(hpLat) || isNaN(hpLng)) return [];
      return [{ shop, dist: distanceMeters(lat, lng, hpLat, hpLng) }];
    })
    .sort((a, b) => a.dist - b.dist);

  // 1. 400m以内 + 正規化名の完全一致
  for (const { shop, dist } of withDist) {
    if (dist > 400) break;
    if (normalizeName(shop.name) === normalized) return shop;
  }

  // 2. 400m以内 + 部分一致（短い方の名前が3文字以上）
  for (const { shop, dist } of withDist) {
    if (dist > 400) break;
    const hpNorm = normalizeName(shop.name);
    if (Math.min(hpNorm.length, normalized.length) < 3) continue;
    if (normalized.includes(hpNorm) || hpNorm.includes(normalized)) return shop;
  }

  // 3. 400m以内 + CJK部分一致（ローマ字・カタカナ表記揺れ対応、2文字以上）
  //    例: Google「炭焼BOOZE」(CJK=炭焼) ⇔ HP「焼き鳥 炭焼きブーズ」
  if (googleCjk.length >= 2) {
    for (const { shop, dist } of withDist) {
      if (dist > 400) break;
      const hpCjk = cjkOnly(normalizeName(shop.name));
      if (hpCjk.length >= 2 && (googleCjk.includes(hpCjk) || hpCjk.includes(googleCjk))) {
        return shop;
      }
    }
  }

  // 4. 150m以内 + CJK先頭2文字の交差一致（より緩い最終ヒューリスティック）
  if (googleCjk.length >= 2) {
    for (const { shop, dist } of withDist) {
      if (dist > 150) break;
      const hpCjk = cjkOnly(normalizeName(shop.name));
      if (
        hpCjk.length >= 2 &&
        (googleCjk.includes(hpCjk.slice(0, 2)) || hpCjk.includes(googleCjk.slice(0, 2)))
      ) {
        return shop;
      }
    }
  }

  return null;
}

/**
 * HP の non_smoking フィールドから喫煙情報を解析
 */
export function parseHpSmoking(
  shop: HpShop
): "smoking" | "no_smoking" | "partial" | "unknown" {
  const ns = shop.non_smoking;
  if (!ns) return "unknown";
  if (ns.includes("全席禁煙")) return "no_smoking";
  if (ns.includes("全席喫煙") || ns === "禁煙席なし") return "smoking";
  if (ns.includes("禁煙") || ns.includes("喫煙")) return "partial";
  return "unknown";
}
