// ============================================================
// HotPepper Gourmet API integration
// JSONP-based browser-side API calls
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
  course?: string;
  // vacancy field: may be string "空席あり"/"満席" or object
  vacancy?: string | { id?: string; name?: string };
}

interface HpResponse {
  results: {
    shop?: HpShop[];
    results_available?: number;
    results_returned?: number;
  };
}

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
 * ホットペッパーAPI で位置情報周辺の居酒屋を検索
 * range=3 → 1000m 圏内
 */
export async function searchHotpepper(
  location: { lat: number; lng: number },
  options: { vacancyOnly?: boolean } = {}
): Promise<HpShop[]> {
  const apiKey = import.meta.env.VITE_HOTPEPPER_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    key: apiKey,
    lat: String(location.lat),
    lng: String(location.lng),
    range: "3", // 1000m
    keyword: "居酒屋",
    count: "100",
  });
  if (options.vacancyOnly) params.set("vacancy", "1");

  const url = `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params}`;

  try {
    const data = await callJsonp(url);
    return data.results.shop ?? [];
  } catch (err) {
    console.warn("HotPepper API error:", err);
    return [];
  }
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
  return s.replace(/[^\u3040-\u9FFF]/g, "");
}

/**
 * Google Places の店舗に対応する HotPepper shop を探す
 * 優先順: 座標50m以内 → 座標150m以内+CJK名前一致 → 名前のみ
 */
export function matchHpShop(
  googleName: string,
  lat: number,
  lng: number,
  hpShops: HpShop[]
): HpShop | null {
  const normalized = normalizeName(googleName);
  const googleCjk = cjkOnly(normalized);

  // 1. 座標50m以内 → ほぼ確実に同一店舗
  for (const shop of hpShops) {
    const hpLat = parseFloat(shop.lat);
    const hpLng = parseFloat(shop.lng);
    if (isNaN(hpLat) || isNaN(hpLng)) continue;
    if (distanceMeters(lat, lng, hpLat, hpLng) <= 50) return shop;
  }

  // 2. 座標150m以内 + CJK名前の先頭2文字以上一致
  if (googleCjk.length >= 2) {
    for (const shop of hpShops) {
      const hpLat = parseFloat(shop.lat);
      const hpLng = parseFloat(shop.lng);
      if (isNaN(hpLat) || isNaN(hpLng)) continue;
      if (distanceMeters(lat, lng, hpLat, hpLng) > 150) continue;
      const hpCjk = cjkOnly(normalizeName(shop.name));
      if (hpCjk.length >= 2 && (googleCjk.includes(hpCjk.slice(0, 2)) || hpCjk.includes(googleCjk.slice(0, 2)))) {
        return shop;
      }
    }
  }

  // 3. 名前のみ: 完全一致
  for (const shop of hpShops) {
    if (normalizeName(shop.name) === normalized) return shop;
  }

  // 4. 名前のみ: 部分一致
  for (const shop of hpShops) {
    const hpNorm = normalizeName(shop.name);
    if (normalized.includes(hpNorm) || hpNorm.includes(normalized)) return shop;
  }

  // 5. 名前のみ: 前方一致（最低4文字）
  if (normalized.length >= 4) {
    for (const shop of hpShops) {
      const hpNorm = normalizeName(shop.name);
      const checkLen = Math.min(normalized.length, hpNorm.length, 6);
      if (checkLen >= 4 && normalized.slice(0, checkLen) === hpNorm.slice(0, checkLen)) return shop;
    }
  }

  // 6. 名前のみ: CJK部分一致（ロマ字・カタカナ混在対応）
  if (googleCjk.length >= 2) {
    for (const shop of hpShops) {
      const hpCjk = cjkOnly(normalizeName(shop.name));
      if (googleCjk.includes(hpCjk) || hpCjk.includes(googleCjk)) return shop;
    }
  }

  return null;
}

/**
 * HP の vacancy フィールドから空席有無を判定
 * undefined → HP 未連携（表示はするがバッジなし）
 * true  → 空席あり
 * false → 満席（非表示にする）
 */
export function parseHpVacancy(shop: HpShop): boolean | undefined {
  if (!shop.vacancy) return undefined;

  const v =
    typeof shop.vacancy === "string"
      ? shop.vacancy
      : shop.vacancy.name ?? "";

  if (!v) return undefined;
  if (v.includes("満席") || v.includes("空席なし") || v === "0") return false;
  // "空席あり", "残りわずか" etc. → true
  return true;
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
