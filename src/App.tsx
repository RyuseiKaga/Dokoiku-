import { useState } from "react";
import { searchIzakayas } from "./lib/google-places";
import { rankWithAI } from "./lib/ai-ranking";
import { timeUntilClose, formatCloseTime, isClosingSoon, matchesBudget, matchesCapacity } from "./lib/utils";
import type { Izakaya, AiResult, SearchConditions } from "./types";

// ============================================================
// Design tokens
// ============================================================
const t = {
  bg: "#F6F4F0",
  card: "#FFFFFF",
  cardBorder: "#EBE8E3",
  text: "#3D3832",
  textSub: "#8C857B",
  textMuted: "#B8B2A8",
  accent: "#C4956A",
  accentLight: "#F0E4D7",
  accentSoft: "#E8D5C4",
  green: "#7BAE7F",
  greenBg: "#EFF6EF",
  red: "#CC8080",
  amber: "#C4A34E",
  amberBg: "#F7F2E4",
  tagBg: "#F0ECE6",
};

const PRICE_OPTIONS = [
  { key: "安い", label: "とにかく安く", sub: "〜¥2,500/人" },
  { key: "普通", label: "ふつう", sub: "¥2,500〜4,000" },
  { key: "高い", label: "良い店がいい", sub: "¥4,000〜" },
];
const SIZE_OPTIONS = [
  { key: "small" as const, label: "数人", sub: "2〜4人" },
  { key: "medium" as const, label: "8人くらい", sub: "5〜10人" },
  { key: "large" as const, label: "大人数", sub: "10人以上" },
];
const SMOKE_OPTIONS = [
  { key: null as boolean | null, label: "こだわらない" },
  { key: true as boolean | null, label: "喫煙できる店" },
  { key: false as boolean | null, label: "禁煙の店" },
];

// ============================================================
// Sub components
// ============================================================
function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: t.amber }}>
        {"★".repeat(Math.floor(rating))}
        {rating % 1 >= 0.5 ? "½" : ""}
      </span>
      <span style={{ color: t.textSub, fontSize: 13, fontWeight: 600 }}>{rating}</span>
    </span>
  );
}

function Tag({ children, color, bg }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6,
        background: bg || t.tagBg, color: color || t.textSub, lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

function VacancyBadge() {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 700,
      color: "#5A9E6A", background: "#EBF5EC",
      padding: "3px 9px", borderRadius: 6,
    }}>
      <span style={{ fontSize: 10 }}>◉</span> 空席あり
    </div>
  );
}

function OpenBadge({ closeTime }: { closeTime: string | null }) {
  if (!closeTime) {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: t.green }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.green, animation: "blink 2s ease-in-out infinite" }} />
        <span>営業中</span>
      </div>
    );
  }
  const closing = isClosingSoon(closeTime);
  const remaining = timeUntilClose(closeTime);
  const color = closing ? t.red : t.green;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}40`, animation: "blink 2s ease-in-out infinite" }} />
      <span>営業中</span>
      <span style={{ color: t.textMuted, fontWeight: 500 }}>
        {formatCloseTime(closeTime)}まで{remaining ? `（${remaining}）` : ""}
      </span>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 4px", borderRadius: 12, cursor: "pointer", textAlign: "center",
      background: active ? t.accentLight : "#fff",
      border: active ? `1.5px solid ${t.accentSoft}` : "1.5px solid #EBE8E3",
      color: active ? t.accent : t.textSub,
      transition: "all 0.25s ease", flex: 1, fontFamily: "inherit",
    }}>
      {children}
    </button>
  );
}

function SectionLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: t.textMuted }}>{hint}</div>}
    </div>
  );
}

function PlacePhoto({ url, name }: { url: string | null; name: string }) {
  if (!url) return null;
  return (
    <div style={{
      width: "100%", height: 140, borderRadius: 10, overflow: "hidden",
      marginBottom: 14, background: t.tagBg,
    }}>
      <img src={url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
    </div>
  );
}

// ============================================================
// Main App
// ============================================================
export default function App() {
  const [screen, setScreen] = useState<"conditions" | "loading" | "results">("conditions");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [smoking, setSmoking] = useState<boolean | null>(null);
  const [budgets, setBudgets] = useState<string[]>([]);
  const [groupSize, setGroupSize] = useState<"small" | "medium" | "large" | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const getLocation = () => {
    setLocLoading(true);
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError("位置情報がサポートされていません");
      setLocLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocLoading(false);
      },
      () => {
        setLocError("位置情報を取得できませんでした");
        setLocLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const toggleBudget = (key: string) =>
    setBudgets((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const canSearch = location && groupSize;

  // ========================
  // 検索実行
  // ========================
  const doSearch = async () => {
    if (!location || !groupSize) return;
    setScreen("loading");
    setLoadingStep(0);
    setError(null);

    try {
      // Step 1-3: Google Places API で居酒屋を検索
      const allPlaces = await searchIzakayas(location, (step) => setLoadingStep(step));

      // Step 4: ユーザー条件でフィルタ
      const filtered = allPlaces.filter((p) => {
        if (!matchesBudget(p.price_label, budgets)) return false;
        if (!matchesCapacity(p.reviews, groupSize)) return false;
        // 喫煙フィルタ: Google APIでは取得不可のためスキップ
        // 将来的にホットペッパーAPI等で補完可能
        return true;
      });

      // Step 5: AI でランキング
      setLoadingStep(4);
      const conditions: SearchConditions = { smoking, budgets, groupSize, location };
      const result = await rankWithAI(filtered, conditions);

      // 表示順: 1.空席バッジあり → 2.評価高い → 3.距離近い
      const sortedRankings = [...result.rankings].sort((a, b) => {
        const pa = result.places.find((p) => p.name === a.name);
        const pb = result.places.find((p) => p.name === b.name);
        if (!pa || !pb) return 0;
        const va = pa.hp_vacancy === true ? 0 : 1;
        const vb = pb.hp_vacancy === true ? 0 : 1;
        if (va !== vb) return va - vb;
        if (Math.abs(pa.rating - pb.rating) > 0.01) return pb.rating - pa.rating;
        return pa.walk_minutes - pb.walk_minutes;
      }).map((r, i) => ({ ...r, rank: i + 1 }));

      setAiResult({ ...result, rankings: sortedRankings });
      setScreen("results");
    } catch (err: any) {
      console.error("Search error:", err);
      setError(err.message || "検索に失敗しました");
      setScreen("conditions");
    }
  };

  const reset = () => {
    setScreen("conditions");
    setAiResult(null);
    setLoadingStep(0);
  };

  const getPlace = (name: string) => aiResult?.places?.find((p) => p.name === name);

  const pageBase: React.CSSProperties = {
    minHeight: "100vh",
    background: t.bg,
    color: t.text,
    fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', sans-serif",
  };

  // ========= CONDITIONS SCREEN =========
  if (screen === "conditions") {
    return (
      <div style={pageBase}>
        <div style={{ maxWidth: 400, margin: "0 auto", padding: "32px 20px 48px" }}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 12, letterSpacing: 4, color: t.textMuted, fontWeight: 500, marginBottom: 10 }}>IZAKAYA FINDER</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: t.text, letterSpacing: -0.5 }}>次、どこ行く？</h1>
            <div style={{ width: 32, height: 2, background: t.accent, margin: "14px auto 0", borderRadius: 2, opacity: 0.6 }} />
          </div>

          {/* Location */}
          <div style={{ marginBottom: 28 }}>
            {!location ? (
              <button onClick={getLocation} disabled={locLoading} style={{
                width: "100%", padding: "16px 20px", border: `1.5px dashed ${t.accentSoft}`, borderRadius: 14, cursor: "pointer",
                background: "rgba(196,149,106,0.04)", color: t.accent, fontSize: 14, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit",
              }}>
                <span style={{ fontSize: 18 }}>{locLoading ? "◌" : "◎"}</span>
                {locLoading ? "取得しています…" : "現在地を取得する"}
              </button>
            ) : (
              <div style={{
                padding: "14px 18px", borderRadius: 14,
                background: t.greenBg, border: "1px solid rgba(123,174,127,0.2)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.green, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.green }}>現在地を取得しました</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>ここから徒歩8分圏内で検索します</div>
                </div>
              </div>
            )}
            {locError && <div style={{ color: t.red, fontSize: 12, marginTop: 8, paddingLeft: 4 }}>{locError}</div>}
          </div>

          {/* Auto conditions */}
          <div style={{ marginBottom: 32, padding: "14px 18px", borderRadius: 12, background: "#fff", border: `1px solid ${t.cardBorder}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: 1, marginBottom: 8 }}>自動で適用</div>
            <div style={{ fontSize: 13, color: t.textSub, lineHeight: 2 }}>
              居酒屋のみ ・ 徒歩8分以内 ・ 評価3.8以上<br />
              <span style={{ color: t.green, fontWeight: 600 }}>● 今やっているお店のみ</span>
              <span style={{ color: t.textMuted, fontSize: 11 }}>（Google Maps営業時間）</span>
            </div>
          </div>

          {/* Smoking */}
          <div style={{ marginBottom: 28 }}>
            <SectionLabel label="喫煙" />
            <div style={{ display: "flex", gap: 8 }}>
              {SMOKE_OPTIONS.map((opt) => (
                <Pill key={String(opt.key)} active={smoking === opt.key} onClick={() => setSmoking(opt.key)}>
                  <div style={{ fontSize: 13, fontWeight: smoking === opt.key ? 700 : 500 }}>{opt.label}</div>
                </Pill>
              ))}
            </div>
            {smoking !== null && (
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 8, paddingLeft: 2 }}>
                ※ 喫煙情報はGoogle APIでは取得できないため、AI判定の参考情報として使用します
              </div>
            )}
          </div>

          {/* Budget */}
          <div style={{ marginBottom: 28 }}>
            <SectionLabel label="予算" hint="複数選択OK・未選択=こだわらない" />
            <div style={{ display: "flex", gap: 8 }}>
              {PRICE_OPTIONS.map((opt) => {
                const active = budgets.includes(opt.key);
                return (
                  <Pill key={opt.key} active={active} onClick={() => toggleBudget(opt.key)}>
                    <div style={{ fontSize: 13, fontWeight: active ? 700 : 500 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, marginTop: 3, color: active ? t.accent : t.textMuted, opacity: 0.8 }}>{opt.sub}</div>
                  </Pill>
                );
              })}
            </div>
          </div>

          {/* Group size */}
          <div style={{ marginBottom: 36 }}>
            <SectionLabel label="人数" />
            <div style={{ display: "flex", gap: 8 }}>
              {SIZE_OPTIONS.map((opt) => {
                const active = groupSize === opt.key;
                return (
                  <Pill key={opt.key} active={active} onClick={() => setGroupSize(opt.key)}>
                    <div style={{ fontSize: 13, fontWeight: active ? 700 : 500 }}>{opt.label}</div>
                    <div style={{ fontSize: 10, marginTop: 3, color: active ? t.accent : t.textMuted, opacity: 0.8 }}>{opt.sub}</div>
                  </Pill>
                );
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: 10, background: "#F8EFEF", border: "1px solid rgba(204,128,128,0.2)", color: t.red, fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* CTA */}
          <button onClick={doSearch} disabled={!canSearch} style={{
            width: "100%", padding: 17, border: "none", borderRadius: 14, cursor: canSearch ? "pointer" : "default",
            background: canSearch ? t.accent : t.tagBg, color: canSearch ? "#fff" : t.textMuted,
            fontSize: 15, fontWeight: 700, letterSpacing: 0.5,
            boxShadow: canSearch ? "0 6px 24px rgba(196,149,106,0.2)" : "none",
            transition: "all 0.3s", marginTop: 8, fontFamily: "inherit",
          }}>
            {canSearch ? "お店を探す" : "現在地と人数を選んでください"}
          </button>
        </div>
        <style>{gStyle}</style>
      </div>
    );
  }

  // ========= LOADING SCREEN =========
  if (screen === "loading") {
    const msgs = [
      "近くの居酒屋を検索しています",
      "評価 3.8 以上に絞り込んでいます",
      "営業時間を確認しています",
      "ホットペッパーで空席を確認しています",
      "AIがおすすめを選んでいます",
    ];
    return (
      <div style={{ ...pageBase, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 32 }}>
          <div style={{
            width: 48, height: 48, margin: "0 auto 32px",
            border: `2.5px solid ${t.tagBg}`, borderTop: `2.5px solid ${t.accent}`,
            borderRadius: "50%", animation: "spin 1s linear infinite",
          }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {msgs.map((msg, i) => (
              <div key={i} style={{
                fontSize: 14, fontWeight: 500, color: loadingStep >= i ? t.text : t.textMuted,
                transition: "color 0.5s", display: "flex", alignItems: "center", gap: 10, justifyContent: "center",
              }}>
                {loadingStep > i && <span style={{ color: t.green, fontSize: 14 }}>✓</span>}
                {loadingStep === i && <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.accent, animation: "pulse 1s ease-in-out infinite" }} />}
                {loadingStep < i && <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.tagBg }} />}
                {msg}
              </div>
            ))}
          </div>
        </div>
        <style>{gStyle}</style>
      </div>
    );
  }

  // ========= RESULTS SCREEN =========
  return (
    <div style={pageBase}>
      <div style={{ maxWidth: 400, margin: "0 auto", padding: "24px 20px 48px" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <button onClick={reset} style={{
            background: "#fff", border: `1px solid ${t.cardBorder}`, color: t.textSub,
            padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit",
          }}>← 条件を変える</button>
          <div style={{ fontSize: 12, color: t.textMuted }}>{aiResult?.places?.length || 0}件</div>
        </div>

        {/* Condition chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 22 }}>
          {["徒歩8分圏内", "★ 3.8以上", "営業中のみ",
            SIZE_OPTIONS.find((s) => s.key === groupSize)?.label,
            smoking === true ? "喫煙OK" : smoking === false ? "禁煙" : null,
            ...(budgets.length > 0 ? budgets : []),
          ].filter(Boolean).map((chip, i) => (
            <span key={i} style={{
              fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
              background: chip === "営業中のみ" ? t.greenBg : t.accentLight,
              color: chip === "営業中のみ" ? t.green : t.accent,
            }}>{chip}</span>
          ))}
        </div>

        {/* AI Summary */}
        {aiResult?.summary && (
          <div style={{ padding: "16px 20px", borderRadius: 14, marginBottom: 24, background: "#fff", border: `1px solid ${t.cardBorder}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: t.accentLight, color: t.accent, letterSpacing: 0.5 }}>AI</span>
            </div>
            <p style={{ fontSize: 14, margin: 0, lineHeight: 1.8, color: t.textSub }}>{aiResult.summary}</p>
          </div>
        )}

        {/* Result cards */}
        {aiResult?.rankings?.map((rec, idx) => {
          const place = getPlace(rec.name);
          if (!place) return null;
          const isTop = idx === 0;

          return (
            <div key={rec.name} style={{
              padding: 20, borderRadius: 16, marginBottom: 12, background: "#fff",
              border: isTop ? `1.5px solid ${t.accentSoft}` : `1px solid ${t.cardBorder}`,
              boxShadow: isTop ? "0 4px 20px rgba(196,149,106,0.08)" : "0 1px 4px rgba(0,0,0,0.03)",
              animation: `fadeUp 0.4s ease ${idx * 0.06}s both`,
            }}>
              {/* Photo */}
              <PlacePhoto url={place.photo_url} name={place.name} />

              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{
                  minWidth: 36, height: 36, borderRadius: 10,
                  background: isTop ? t.accent : t.tagBg,
                  color: isTop ? "#fff" : t.textMuted,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 15, fontWeight: 800, flexShrink: 0,
                }}>{rec.rank}</div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: t.text, marginBottom: 6 }}>{place.name}</div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <OpenBadge closeTime={place.close_time} />
                    {place.hp_vacancy && <VacancyBadge />}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                    <Stars rating={place.rating} />
                    <span style={{ fontSize: 11, color: t.textMuted }}>({place.reviews}件)</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <Tag
                      color={place.price_label === "安い" ? "#6A9E6E" : place.price_label === "高い" ? "#9E7BB8" : t.amber}
                      bg={place.price_label === "安い" ? t.greenBg : place.price_label === "高い" ? "#F3EFF8" : t.amberBg}
                    >{place.price_label}</Tag>
                    <Tag>徒歩{place.walk_minutes}分</Tag>
                    {place.smoking === "no_smoking" && <Tag color="#6A9E9E" bg="#EBF3F5">禁煙</Tag>}
                    {place.smoking === "smoking" && <Tag color="#9E7A5A" bg="#F5EDE6">喫煙OK</Tag>}
                    {place.smoking === "partial" && <Tag color="#9E9E5A" bg="#F5F2E6">喫煙席あり</Tag>}
                    {place.hp_has_free_drink && <Tag color={t.accent} bg={t.accentLight}>飲み放題</Tag>}
                    {place.hp_has_private_room && <Tag>個室あり</Tag>}
                    {place.hp_capacity && <Tag>{place.hp_capacity}席</Tag>}
                  </div>
                </div>
              </div>

              {/* Address */}
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 12, paddingLeft: 50, lineHeight: 1.7 }}>
                {place.address}
              </div>

              {/* AI reason */}
              <div style={{
                marginTop: 14, padding: "11px 14px", borderRadius: 10,
                background: isTop ? "rgba(196,149,106,0.04)" : t.bg,
                display: "flex", alignItems: "flex-start", gap: 8,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, flexShrink: 0,
                  background: t.accentLight, color: t.accent, marginTop: 1, whiteSpace: "nowrap",
                }}>{rec.highlight}</span>
                <span style={{ fontSize: 12, color: t.textSub, lineHeight: 1.7 }}>{rec.reason}</span>
              </div>

              {/* Link buttons */}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <a href={place.google_maps_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", flex: 1 }}>
                  <button style={{
                    width: "100%", padding: 10, borderRadius: 8, cursor: "pointer",
                    background: t.bg, border: `1px solid ${t.cardBorder}`,
                    color: t.textSub, fontSize: 12, fontWeight: 600, textAlign: "center", fontFamily: "inherit",
                  }}>Google Map →</button>
                </a>
                {place.hp_url && (
                  <a href={place.hp_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", flex: 1 }}>
                    <button style={{
                      width: "100%", padding: 10, borderRadius: 8, cursor: "pointer",
                      background: t.accentLight, border: `1px solid ${t.accentSoft}`,
                      color: t.accent, fontSize: 12, fontWeight: 700, textAlign: "center", fontFamily: "inherit",
                    }}>ホットペッパー →</button>
                  </a>
                )}
              </div>
            </div>
          );
        })}

        {/* No results */}
        {(!aiResult?.rankings || aiResult.rankings.length === 0) && (
          <div style={{ textAlign: "center", padding: "48px 20px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: t.textSub }}>条件に合う営業中のお店が見つかりませんでした</div>
            <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 24 }}>条件を変えてもう一度試してみてください</div>
            <button onClick={reset} style={{
              padding: "12px 28px", borderRadius: 10, border: `1px solid ${t.accentSoft}`,
              background: t.accentLight, color: t.accent, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>条件を変えて再検索</button>
          </div>
        )}
      </div>
      <style>{gStyle}</style>
    </div>
  );
}

const gStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700;800&display=swap');
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; background: #F6F4F0; }
  button { font-family: inherit; }
  button:active { opacity: 0.85; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
