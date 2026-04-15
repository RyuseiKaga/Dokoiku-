import { Izakaya } from "../types";
import { HpShop, searchHotpepper, matchHpShop, parseHpSmoking } from "./hotpepper";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// ============================================================
// Google Places API (Maps JavaScript API - Places Library)
// ============================================================

const WALK_SPEED_M_PER_MIN = 80; // 徒歩速度: 約80m/分
const MAX_WALK_MINUTES = 8;
const MAX_RADIUS_METERS = WALK_SPEED_M_PER_MIN * MAX_WALK_MINUTES; // 640m
const MIN_RATING = 3.8;

// 居酒屋以外を除外するキーワード（店名に含まれる場合はスキップ）
const EXCLUDE_NAME_KEYWORDS = [
  "シーシャ",
  "shisha",
  "水タバコ",
  "スナック",
  "キャバクラ",
  "ガールズバー",
  "ラーメン",
  "つけ麺",
  "中華料理",
  "ネットカフェ",
  "漫画喫茶",
];

function getPlacesService(): google.maps.places.PlacesService {
  const div = document.createElement("div");
  return new google.maps.places.PlacesService(div);
}

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

function priceLevelToLabel(
  level: number | undefined | null
): "安い" | "普通" | "高い" {
  if (level == null) return "普通";
  if (level <= 1) return "安い";
  if (level === 2) return "普通";
  return "高い";
}

function getCloseTime(
  place: google.maps.places.PlaceResult
): string | null {
  try {
    const periods = place.opening_hours?.periods;
    if (!periods) return null;

    const now = new Date();
    const dayOfWeek = now.getDay();

    for (const period of periods) {
      if (!period.close) continue;

      const openDay = period.open?.day;
      const closeDay = period.close.day;
      const closeHour = period.close.hours ?? 0;
      const closeMin = period.close.minutes ?? 0;

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

function isExcluded(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCLUDE_NAME_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

function nearbySearch(
  service: google.maps.places.PlacesService,
  location: { lat: number; lng: number }
): Promise<google.maps.places.PlaceResult[]> {
  return new Promise((resolve, reject) => {
    const request: google.maps.places.PlaceSearchRequest = {
      location: new google.maps.LatLng(location.lat, location.lng),
      radius: MAX_RADIUS_METERS,
      type: "restaurant",
      keyword: "居酒屋 酒場 焼鳥",
      openNow: true,
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
 * 座標・名前でマッチしなかった店舗を Claude Haiku で照合する
 * 各ペアについて「同一店舗か否か」を返す
 */
async function aiMatchHpShops(
  pairs: Array<{ izakaya: Izakaya; candidates: HpShop[] }>
): Promise<Map<string, HpShop>> {
  const result = new Map<string, HpShop>();
  if (pairs.length === 0) return result;

  const lines = pairs
    .map((pair, i) => {
      const hpLines = pair.candidates
        .map((hp, j) => `  [${j}] ${hp.name}（${hp.address}）`)
        .join("\n");
      return `[${i}] Google: ${pair.izakaya.name}（${pair.izakaya.address}）\nHP候補:\n${hpLines}`;
    })
    .join("\n\n");

  const prompt = `以下のGoogle店舗とHotPepper店舗が同一店舗かどうか判断してください。
同一と判断した場合は対応するHP候補のインデックス（0始まりの数値）、なければnullを返してください。
店名の表記揺れ（例: 英語・カタカナ・略称の違い）を考慮してください。

${lines}

JSON形式のみで返答してください。例: {"0": 0, "1": null}
キー=Googleペアのインデックス、値=同一と判断したHP候補インデックス(なければnull)`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`AI match API error: ${response.status}`);

    const data = await response.json();
    const text = data.content?.map((i: any) => i.text || "").join("") || "";
    console.log("[AI match] レスポンス:", text);
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as Record<string, number | null>;

    for (const [idxStr, candIdx] of Object.entries(parsed)) {
      if (candIdx === null || candIdx === undefined) continue;
      const pair = pairs[parseInt(idxStr)];
      if (!pair) continue;
      const hp = pair.candidates[candIdx];
      if (!hp) continue;
      result.set(pair.izakaya.place_id, hp);
    }
  } catch (err) {
    console.warn("AI HP matching error:", err);
  }

  return result;
}

/**
 * メインの検索関数
 * 1. Nearby Search で居酒屋を取得
 * 2. 除外ワード・評価・距離でフィルタ
 * 3. Place Details で営業時間を取得
 * 4. HotPepper API で空席・喫煙情報を補完
 * 5. HP連携店で満席なら除外
 * 6. 評価順にソート
 */
export async function searchIzakayas(
  location: { lat: number; lng: number },
  onProgress?: (step: number) => void
): Promise<Izakaya[]> {
  const service = getPlacesService();

  // Step 0: Nearby Search
  onProgress?.(0);
  const rawResults = await nearbySearch(service, location);

  // Step 1: フィルタ（除外ワード・評価・距離）
  onProgress?.(1);
  const filtered = rawResults.filter((place) => {
    if (!place.place_id || !place.geometry?.location) return false;
    if ((place.rating ?? 0) < MIN_RATING) return false;
    if (place.name && isExcluded(place.name)) return false;

    const dist = haversineDistance(
      location.lat,
      location.lng,
      place.geometry.location.lat(),
      place.geometry.location.lng()
    );
    if (dist > MAX_RADIUS_METERS * 1.3) return false;

    return true;
  });

  // Step 2: Place Details 取得（上位20件、5件ずつ並列）
  onProgress?.(2);
  const top = filtered.slice(0, 20);
  const detailed: Izakaya[] = [];

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
      const walkMeters = distMeters * 1.3;
      const walkMin = Math.ceil(walkMeters / WALK_SPEED_M_PER_MIN);

      if (walkMin > MAX_WALK_MINUTES) continue;
      if (place.name && isExcluded(place.name)) continue;

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
        smoking: "unknown",
        distance_meters: Math.round(walkMeters),
        walk_minutes: walkMin,
        is_open: true,
        close_time: getCloseTime(place),
        address: place.formatted_address ?? "",
        photo_url: photoUrl,
        lat,
        lng,
        google_maps_url:
          place.url ??
          `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
      });
    }
  }

  // Step 3: HotPepper で空席・喫煙情報を補完
  onProgress?.(3);
  const [hpShops, hpVacancyShops] = await Promise.all([
    searchHotpepper(location),
    searchHotpepper(location, { vacancyOnly: true }),
  ]);
  console.log("[HP] 取得店舗数:", hpShops.length, "空席あり:", hpVacancyShops.length);
  console.log("[HP] 店舗一覧:", hpShops.map((s) => `${s.name} (${s.lat},${s.lng})`));
  const hpVacancyIds = new Set(hpVacancyShops.map((s) => s.id));

  const enriched: Izakaya[] = [];
  for (const izakaya of detailed) {
    const hpShop = matchHpShop(izakaya.name, izakaya.lat, izakaya.lng, hpShops);

    if (!hpShop) {
      console.log(`[HP] マッチなし: ${izakaya.name}`);
      enriched.push(izakaya);
      continue;
    }

    console.log(`[HP] マッチ: ${izakaya.name} → ${hpShop.name}`);
    enriched.push({
      ...izakaya,
      smoking: parseHpSmoking(hpShop),
      hp_id: hpShop.id,
      hp_url: hpShop.urls.pc,
      // vacancy=1 検索に含まれた店舗のみ true（バッジ表示）
      hp_vacancy: hpVacancyIds.has(hpShop.id) ? true : undefined,
      hp_has_free_drink: hpShop.free_drink === "あり",
      hp_has_private_room: hpShop.private_room === "あり",
      hp_capacity: hpShop.capacity,
    });
  }

  // Step 4: AI マッチング（座標・名前でマッチしなかった店舗を Claude で照合）
  const unmatchedPairs: Array<{ izakaya: Izakaya; candidates: HpShop[] }> = [];
  for (const iz of enriched) {
    if (iz.hp_id) continue; // already matched

    const nearbyCandidates = hpShops.filter((hp) => {
      const hpLat = parseFloat(hp.lat);
      const hpLng = parseFloat(hp.lng);
      if (isNaN(hpLat) || isNaN(hpLng)) return false;
      return haversineDistance(iz.lat, iz.lng, hpLat, hpLng) <= 300;
    });

    if (nearbyCandidates.length > 0) {
      console.log(`[AI match] 候補あり: ${iz.name} → HP候補:`, nearbyCandidates.map((h) => h.name));
      unmatchedPairs.push({ izakaya: iz, candidates: nearbyCandidates });
    }
  }

  if (unmatchedPairs.length > 0) {
    const aiMatches = await aiMatchHpShops(unmatchedPairs);

    for (let i = 0; i < enriched.length; i++) {
      const iz = enriched[i];
      if (iz.hp_id) continue;
      const hpShop = aiMatches.get(iz.place_id);
      if (!hpShop) continue;

      enriched[i] = {
        ...iz,
        smoking: parseHpSmoking(hpShop),
        hp_id: hpShop.id,
        hp_url: hpShop.urls.pc,
        hp_vacancy: hpVacancyIds.has(hpShop.id) ? true : undefined,
        hp_has_free_drink: hpShop.free_drink === "あり",
        hp_has_private_room: hpShop.private_room === "あり",
        hp_capacity: hpShop.capacity,
      };
    }
  }

  // 評価順にソート
  enriched.sort((a, b) => b.rating - a.rating);

  return enriched;
}
