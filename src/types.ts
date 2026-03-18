export interface Izakaya {
  place_id: string;
  name: string;
  rating: number;
  reviews: number;
  price_level: number | null; // 0-4 from Google
  price_label: "安い" | "普通" | "高い";
  smoking: "smoking" | "no_smoking" | "partial" | "unknown";
  distance_meters: number;
  walk_minutes: number;
  is_open: boolean;
  close_time: string | null; // "23:00" or "02:00" etc
  address: string;
  photo_url: string | null;
  lat: number;
  lng: number;
  google_maps_url: string;
  // HotPepper fields (undefined = not linked to HP)
  hp_id?: string;
  hp_url?: string;
  hp_vacancy?: boolean; // true = has vacancy
  hp_has_free_drink?: boolean;
  hp_has_private_room?: boolean;
  hp_capacity?: number;
}

export interface AiRanking {
  name: string;
  rank: number;
  reason: string;
  highlight: string;
}

export interface AiResult {
  rankings: AiRanking[];
  summary: string;
  places: Izakaya[];
}

export interface SearchConditions {
  smoking: boolean | null; // true=喫煙OK, false=禁煙, null=こだわらない
  budgets: string[]; // ["安い", "普通", "高い"]
  groupSize: "small" | "medium" | "large" | null;
  location: { lat: number; lng: number };
}
