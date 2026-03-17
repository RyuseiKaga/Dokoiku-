import { Izakaya } from "../types";

// ============================================================
// Google Places API (Maps JavaScript API - Places Library)
// ============================================================
// 使用するAPI:
//   1. Nearby Search   → 居酒屋を半径640m(≒徒歩8分)で検索
//   2. Place Details    → 営業時間の詳細を取得
//   3. Distance Matrix  → 正確な徒歩距離（オプション）
// ============================================================

const WALK_SPEED_M_PER_MIN = 80; // 徒歩速度: 約80m/分
const MAX_WALK_MINUTES = 8;
const MAX_RADIUS_METERS = WALK_SPEED_M_PER_MIN * MAX_WALK_MINUTES; // 640m
const MIN_RATING = 3.8;

/**
 * Google Maps JavaScript APIのPlacesServiceを初期化
 * index.html で Google Maps script を読み込んでいる前提
 */
function getPlacesService(): google.maps.places.PlacesService {
  const div = document.createElement("div");
  return new google.maps.places.PlacesService(div);
}

/**
 * 2点間の直線距離(メートル)を計算
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
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
 * Google の price_level (0-4) を日本語ラベルに変換
 * 0-1: 安い, 2: 普通, 3-4: 高い
 */
function priceLevelToLabel(
  level: number | undefined | null
): "安い" | "普通" | "高い" {
  if (level == null) return "普通";
  if (level <= 1) return "安い";
  if (level === 2) return "普通";
  return "高い";
}

/**
 * PlaceResult の opening_hours から今日の閉店時刻を取得
 */
function getCloseTime(
  place: google.maps.places.PlaceResult
): string | null {
  try {
    const periods = place.opening_hours?.periods;
    if (!periods) return null;

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=日, 1=月, ..., 6=土

    // 今日の営業期間を探す
    // 深夜またぎの場合: open.day=金(5), close.day=土(6) のようになる
    for (const period of periods) {
      if (!period.close) continue; // 24時間営業

      const openDay = period.open?.day;
      const closeDay = period.close.day;
      const closeHour = period.close.hours ?? 0;
      const closeMin = period.close.minutes ?? 0;

      // 今日openの期間 or 昨日openで今日closeの期間
      if (openDay === dayOfWeek || closeDay === dayOfWeek) {
        const hh = String(closeHour).padStart(2, "0");
        const mm = String(closeMin).padStart(2, "0");
        return `${hh}:${mm}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Nearby Search で居酒屋を検索
 */
function nearbySearch(
  service: google.maps.places.PlacesService,
  location: { lat: number; lng: number }
): Promise<google.maps.places.PlaceResult[]> {
  return new Promise((resolve, reject) => {
    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(location.lat, location.lng),
      radius: MAX_RADIUS_METERS,
      type: "restaurant",
      keyword: "居酒屋",
      openNow: true, // ★ 営業中のみ
      language: "ja",
    };

    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results) {
        resolve(results);
      } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        resolve([]);
      } else {
        reject(new Error(`Places API error: ${status}`));
      }
    });
  });
}

/**
 * Place Details で営業時間などの詳細を取得
 */
function getPlaceDetails(
  service: google.maps.places.PlacesService,
  placeId: string
): Promise<google.maps.places.PlaceResult> {
  return new Promise((resolve, reject) => {
    service.getDetails(
      {
        placeId,
        fields: [
          "place_id",
          "name",
          "rating",
          "user_ratings_total",
          "price_level",
          "opening_hours",
          "formatted_address",
          "geometry",
          "photos",
          "url",
        ],
      },
      (result, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && result) {
          resolve(result);
        } else {
          reject(new Error(`Place Details error: ${status}`));
        }
      }
    );
  });
}

/**
 * メインの検索関数
 * 1. Nearby Search で居酒屋を取得
 * 2. 評価3.8以上 & 徒歩8分以内でフィルタ
 * 3. Place Details で営業時間を取得
 * 4. 評価順にソート
 */
export async function searchIzakayas(
  location: { lat: number; lng: number },
  onProgress?: (step: number) => void
): Promise<Izakaya[]> {
  const service = getPlacesService();

  // Step 1: Nearby Search
  onProgress?.(0);
  const rawResults = await nearbySearch(service, location);

  // Step 2: フィルタ (評価3.8以上 & 営業中は openNow:true で担保済み)
  onProgress?.(1);
  const filtered = rawResults.filter((place) => {
    if (!place.place_id || !place.geometry?.location) return false;
    if ((place.rating ?? 0) < MIN_RATING) return false;

    const dist = haversineDistance(
      location.lat,
      location.lng,
      place.geometry.location.lat(),
      place.geometry.location.lng()
    );
    // 直線640m → 実際の徒歩は1.3倍程度を考慮して830mまで許容
    if (dist > MAX_RADIUS_METERS * 1.3) return false;

    return true;
  });

  // Step 3: 詳細取得 (上位20件まで、API制限考慮)
  onProgress?.(2);
  const top = filtered.slice(0, 20);
  const detailed: Izakaya[] = [];

  // 並列で取得 (5件ずつ)
  for (let i = 0; i < top.length; i += 5) {
    const batch = top.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map((p) => getPlaceDetails(service, p.place_id!))
    );

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const place = result.value;
      if (!place.geometry?.location) continue;

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const distMeters = haversineDistance(location.lat, location.lng, lat, lng);
      // 直線距離 × 1.3 = 実際の徒歩距離（概算）
      const walkMeters = distMeters * 1.3;
      const walkMin = Math.ceil(walkMeters / WALK_SPEED_M_PER_MIN);

      if (walkMin > MAX_WALK_MINUTES) continue;

      const photoUrl = place.photos?.[0]
        ? place.photos[0].getUrl({ maxWidth: 400, maxHeight: 300 })
        : null;

      detailed.push({
        place_id: place.place_id!,
        name: place.name ?? "不明",
        rating: place.rating ?? 0,
        reviews: place.user_ratings_total ?? 0,
        price_level: place.price_level ?? null,
        price_label: priceLevelToLabel(place.price_level),
        smoking: "unknown", // Google APIでは取得不可
        distance_meters: Math.round(walkMeters),
        walk_minutes: walkMin,
        is_open: true, // openNow:true で検索済み
        close_time: getCloseTime(place),
        address: place.formatted_address ?? "",
        photo_url: photoUrl,
        lat,
        lng,
        google_maps_url: place.url ?? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
      });
    }
  }

  // 評価順にソート
  detailed.sort((a, b) => b.rating - a.rating);

  return detailed;
}
