import { useState } from “react”;

const t = {
bg: “#F6F4F0”,
card: “#FFFFFF”,
cardBorder: “#EBE8E3”,
text: “#3D3832”,
textSub: “#8C857B”,
textMuted: “#B8B2A8”,
accent: “#C4956A”,
accentLight: “#F0E4D7”,
accentSoft: “#E8D5C4”,
green: “#7BAE7F”,
greenBg: “#EFF6EF”,
red: “#CC8080”,
redBg: “#F8EFEF”,
amber: “#C4A34E”,
amberBg: “#F7F2E4”,
tagBg: “#F0ECE6”,
};

// — Mock: Google Places APIから取得した想定の居酒屋データ —
// hours_open / hours_close はGoogle Mapsの営業時間
const MOCK_IZAKAYAS = [
{ id: 1, name: “大衆酒場 まるよし”, distance: “徒歩2分”, walkMin: 2, rating: 4.5, reviews: 342, price: “安い”, smoking: true, capacity: “small”, hours_open: “16:00”, hours_close: “01:00”, address: “○○駅前通り1-2-3” },
{ id: 2, name: “個室居酒屋 和楽”, distance: “徒歩5分”, walkMin: 5, rating: 4.3, reviews: 218, price: “普通”, smoking: false, capacity: “large”, hours_open: “17:00”, hours_close: “00:00”, address: “△△町4-5-6” },
{ id: 3, name: “鳥貴族 ○○駅前店”, distance: “徒歩1分”, walkMin: 1, rating: 3.9, reviews: 587, price: “安い”, smoking: false, capacity: “medium”, hours_open: “17:00”, hours_close: “02:00”, address: “□□ビル3F” },
{ id: 4, name: “旬鮮酒場 天狗”, distance: “徒歩4分”, walkMin: 4, rating: 4.0, reviews: 156, price: “普通”, smoking: true, capacity: “large”, hours_open: “16:30”, hours_close: “00:00”, address: “○○通り7-8” },
{ id: 5, name: “炭火焼鳥 いぶし”, distance: “徒歩6分”, walkMin: 6, rating: 4.6, reviews: 98, price: “普通”, smoking: true, capacity: “small”, hours_open: “18:00”, hours_close: “01:00”, address: “△△2丁目9-1” },
{ id: 6, name: “魚民 ○○駅前店”, distance: “徒歩3分”, walkMin: 3, rating: 3.8, reviews: 423, price: “安い”, smoking: true, capacity: “large”, hours_open: “17:00”, hours_close: “03:00”, address: “○○駅ビルB1F” },
{ id: 7, name: “創作居酒屋 KURA”, distance: “徒歩7分”, walkMin: 7, rating: 4.7, reviews: 67, price: “高い”, smoking: false, capacity: “small”, hours_open: “18:00”, hours_close: “00:00”, address: “□□通り12-3” },
{ id: 8, name: “海鮮居酒屋 浜焼太郎”, distance: “徒歩5分”, walkMin: 5, rating: 4.2, reviews: 201, price: “普通”, smoking: false, capacity: “medium”, hours_open: “16:00”, hours_close: “01:00”, address: “△△町6-7-8” },
{ id: 9, name: “居酒屋 わたみん家”, distance: “徒歩2分”, walkMin: 2, rating: 3.9, reviews: 312, price: “安い”, smoking: true, capacity: “large”, hours_open: “17:00”, hours_close: “05:00”, address: “○○駅南口1F” },
{ id: 10, name: “完全個室 月の庭”, distance: “徒歩8分”, walkMin: 8, rating: 4.8, reviews: 45, price: “高い”, smoking: false, capacity: “medium”, hours_open: “17:30”, hours_close: “00:00”, address: “□□裏通り3-2” },
];

const PRICE_OPTIONS = [
{ key: “安い”, label: “とにかく安く”, sub: “〜¥2,500/人” },
{ key: “普通”, label: “ふつう”, sub: “¥2,500〜4,000” },
{ key: “高い”, label: “良い店がいい”, sub: “¥4,000〜” },
];

const SIZE_OPTIONS = [
{ key: “small”, label: “数人”, sub: “2〜4人” },
{ key: “medium”, label: “8人くらい”, sub: “5〜10人” },
{ key: “large”, label: “大人数”, sub: “10人以上” },
];

const SMOKE_OPTIONS = [
{ key: null, label: “こだわらない” },
{ key: true, label: “喫煙できる店” },
{ key: false, label: “禁煙の店” },
];

// — Utility: 現在時刻で営業中か判定 —
function isOpenNow(open, close) {
const now = new Date();
const hh = now.getHours();
const mm = now.getMinutes();
const nowMin = hh * 60 + mm;

const [oh, om] = open.split(”:”).map(Number);
const [ch, cm] = close.split(”:”).map(Number);
const openMin = oh * 60 + om;
let closeMin = ch * 60 + cm;

// 翌日にまたがる場合 (例: 17:00〜03:00)
if (closeMin <= openMin) {
// 深夜0時をまたぐ
return nowMin >= openMin || nowMin < closeMin;
}
return nowMin >= openMin && nowMin < closeMin;
}

// 閉店までの残り時間テキスト
function timeUntilClose(close) {
const now = new Date();
const hh = now.getHours();
const mm = now.getMinutes();
const nowMin = hh * 60 + mm;

const [ch, cm] = close.split(”:”).map(Number);
let closeMin = ch * 60 + cm;

// 翌日またぎ補正
if (closeMin < 12 * 60) closeMin += 24 * 60;
let adjustedNow = nowMin;
if (nowMin < 12 * 60 && closeMin > 24 * 60) adjustedNow += 24 * 60;

const diff = closeMin - adjustedNow;
if (diff <= 0) return null;
if (diff <= 60) return `あと${diff}分`;
const h = Math.floor(diff / 60);
const m = diff % 60;
return m > 0 ? `あと${h}時間${m}分` : `あと${h}時間`;
}

function formatCloseTime(close) {
const [h] = close.split(”:”).map(Number);
if (h >= 0 && h <= 5) return `翌${close}`;
return close;
}

function Stars({ rating }) {
return (
<span style={{ fontSize: 13, display: “inline-flex”, alignItems: “center”, gap: 4 }}>
<span style={{ color: t.amber }}>{“★”.repeat(Math.floor(rating))}{rating % 1 >= 0.5 ? “½” : “”}</span>
<span style={{ color: t.textSub, fontSize: 13, fontWeight: 600 }}>{rating}</span>
</span>
);
}

function Tag({ children, color, bg }) {
return (
<span style={{
fontSize: 11, fontWeight: 600, padding: “3px 9px”, borderRadius: 6,
background: bg || t.tagBg, color: color || t.textSub, lineHeight: 1,
}}>{children}</span>
);
}

function OpenBadge({ close }) {
const remaining = timeUntilClose(close);
const isClosingSoon = (() => {
const now = new Date();
const nowMin = now.getHours() * 60 + now.getMinutes();
const [ch, cm] = close.split(”:”).map(Number);
let closeMin = ch * 60 + cm;
if (closeMin < 12 * 60) closeMin += 24 * 60;
let adj = nowMin;
if (nowMin < 12 * 60 && closeMin > 24 * 60) adj += 24 * 60;
return (closeMin - adj) <= 60;
})();

return (
<div style={{
display: “inline-flex”, alignItems: “center”, gap: 6,
fontSize: 11, fontWeight: 600,
color: isClosingSoon ? t.red : t.green,
}}>
<span style={{
width: 6, height: 6, borderRadius: “50%”,
background: isClosingSoon ? t.red : t.green,
boxShadow: `0 0 6px ${isClosingSoon ? t.red : t.green}40`,
animation: “blink 2s ease-in-out infinite”,
}} />
<span>営業中</span>
<span style={{ color: t.textMuted, fontWeight: 500 }}>
{formatCloseTime(close)}まで{remaining ? `（${remaining}）` : “”}
</span>
</div>
);
}

// ==========================================

export default function App() {
const [screen, setScreen] = useState(“conditions”);
const [location, setLocation] = useState(null);
const [locLoading, setLocLoading] = useState(false);
const [locError, setLocError] = useState(null);
const [smoking, setSmoking] = useState(null);
const [budgets, setBudgets] = useState([]);
const [groupSize, setGroupSize] = useState(null);
const [aiResult, setAiResult] = useState(null);
const [animStage, setAnimStage] = useState(0);

const getLocation = () => {
setLocLoading(true); setLocError(null);
if (!navigator.geolocation) { setLocError(“位置情報がサポートされていません”); setLocLoading(false); return; }
navigator.geolocation.getCurrentPosition(
(pos) => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocLoading(false); },
() => { setLocError(“位置情報を取得できませんでした”); setLocLoading(false); },
{ enableHighAccuracy: true, timeout: 10000 }
);
};

const toggleBudget = (key) => setBudgets(prev => prev.includes(key) ? prev.filter(k => k !== key) : […prev, key]);
const canSearch = location && groupSize;

const doSearch = async () => {
setScreen(“loading”); setAnimStage(0);

```
// フィルタ：条件 + 営業中のみ
const filtered = MOCK_IZAKAYAS.filter(p => {
  if (p.walkMin > 8 || p.rating < 3.8) return false;
  if (!isOpenNow(p.hours_open, p.hours_close)) return false; // 営業中のみ
  if (smoking === true && !p.smoking) return false;
  if (smoking === false && p.smoking) return false;
  if (budgets.length > 0 && !budgets.includes(p.price)) return false;
  if (groupSize === "small" && p.capacity === "large") return false;
  if (groupSize === "large" && p.capacity === "small") return false;
  return true;
}).sort((a, b) => b.rating - a.rating);

const placesInfo = filtered.map(p =>
  `${p.name} - ${p.distance}, 評価${p.rating}(${p.reviews}件), ${p.price}, ${p.smoking ? "喫煙可" : "禁煙"}, キャパ:${p.capacity}, ${p.hours_open}〜${p.hours_close}, 閉店まで${timeUntilClose(p.hours_close) || "不明"}`
).join("\n");
const sizeLabel = SIZE_OPTIONS.find(s => s.key === groupSize)?.label || "";
const budgetLabel = budgets.length > 0 ? budgets.join("・") : "指定なし";
const smokingLabel = smoking === true ? "喫煙可の店のみ" : smoking === false ? "禁煙の店のみ" : "どちらでもOK";

const prompt = `あなたは飲み会の二次会・三次会探しのプロです。以下の条件で、候補の居酒屋からベストな順にランキングしてください。全ての候補店を順位付けしてください。閉店時間が近い店は順位を下げてください。
```

【条件】人数:${sizeLabel} / 予算:${budgetLabel} / 喫煙:${smokingLabel} / 前提:徒歩8分圏内の居酒屋,Google評価3.8以上,現在営業中の店のみ
【候補店】
${placesInfo}
以下のJSON形式のみで返してください。他のテキストやMarkdownは不要です。
{“rankings”:[{“name”:“店名（候補店から正確に）”,“rank”:1,“reason”:“推薦理由。条件にどうマッチしてるか具体的に。40文字以内。フレンドリーな口調で”,“highlight”:“推しポイント15文字以内”}],“summary”:“検索結果まとめ。60文字以内。フレンドリーに”}`;

```
let result;
try {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await response.json();
  const text = data.content?.map(i => i.text || "").join("") || "";
  result = { ...JSON.parse(text.replace(/```json|```/g, "").trim()), places: filtered };
} catch {
  result = {
    rankings: filtered.map((p, i) => ({
      name: p.name, rank: i + 1,
      reason: i === 0 ? "評価トップで条件ぴったり。迷ったらここで間違いなし！" : i === 1 ? "駅近で入りやすい。安定感のあるお店です" : "穴場的な良い店。空いてる可能性も高め",
      highlight: i === 0 ? "いちばんのおすすめ" : i === 1 ? "アクセス良好" : "穴場",
    })),
    summary: `営業中の居酒屋${filtered.length}件を見つけました。評価順に並べています`,
    places: filtered,
  };
}
setAiResult(result);
setTimeout(() => setAnimStage(1), 600);
setTimeout(() => setAnimStage(2), 1200);
setTimeout(() => { setAnimStage(3); setScreen("results"); }, 2000);
```

};

const reset = () => { setScreen(“conditions”); setAiResult(null); setAnimStage(0); };
const getPlace = (name) => MOCK_IZAKAYAS.find(p => p.name === name);

const pageBase = { minHeight: “100vh”, background: t.bg, color: t.text, fontFamily: “‘Zen Kaku Gothic New’, ‘Noto Sans JP’, sans-serif” };

const Pill = ({ active, onClick, children }) => (
<button onClick={onClick} style={{
padding: “10px 4px”, borderRadius: 12, cursor: “pointer”, textAlign: “center”,
background: active ? t.accentLight : “#fff”,
border: active ? `1.5px solid ${t.accentSoft}` : “1.5px solid #EBE8E3”,
color: active ? t.accent : t.textSub,
transition: “all 0.25s ease”, flex: 1, fontFamily: “inherit”,
}}>{children}</button>
);

const SectionLabel = ({ label, hint }) => (
<div style={{ display: “flex”, alignItems: “baseline”, gap: 8, marginBottom: 10 }}>
<div style={{ fontSize: 13, fontWeight: 700, color: t.textSub }}>{label}</div>
{hint && <div style={{ fontSize: 11, color: t.textMuted }}>{hint}</div>}
</div>
);

// ========= CONDITIONS =========
if (screen === “conditions”) {
return (
<div style={pageBase}>
<div style={{ maxWidth: 400, margin: “0 auto”, padding: “32px 20px 48px” }}>
{/* Header */}
<div style={{ textAlign: “center”, marginBottom: 40 }}>
<div style={{ fontSize: 12, letterSpacing: 4, color: t.textMuted, fontWeight: 500, marginBottom: 10 }}>IZAKAYA FINDER</div>
<h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: t.text, letterSpacing: -0.5 }}>次、どこ行く？</h1>
<div style={{ width: 32, height: 2, background: t.accent, margin: “14px auto 0”, borderRadius: 2, opacity: 0.6 }} />
</div>

```
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
      <div style={{
        marginBottom: 32, padding: "14px 18px", borderRadius: 12,
        background: "#fff", border: `1px solid ${t.cardBorder}`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, letterSpacing: 1, marginBottom: 8 }}>自動で適用</div>
        <div style={{ fontSize: 13, color: t.textSub, lineHeight: 2 }}>
          居酒屋のみ ・ 徒歩8分以内 ・ 評価3.8以上<br/>
          <span style={{ color: t.green, fontWeight: 600 }}>● 今やっているお店のみ</span>
          <span style={{ color: t.textMuted, fontSize: 11 }}>（Google Maps営業時間）</span>
        </div>
      </div>

      {/* Smoking */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel label="喫煙" />
        <div style={{ display: "flex", gap: 8 }}>
          {SMOKE_OPTIONS.map(opt => (
            <Pill key={String(opt.key)} active={smoking === opt.key} onClick={() => setSmoking(opt.key)}>
              <div style={{ fontSize: 13, fontWeight: smoking === opt.key ? 700 : 500 }}>{opt.label}</div>
            </Pill>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel label="予算" hint="複数選択OK・未選択=こだわらない" />
        <div style={{ display: "flex", gap: 8 }}>
          {PRICE_OPTIONS.map(opt => {
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
          {SIZE_OPTIONS.map(opt => {
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

      <button onClick={doSearch} disabled={!canSearch} style={{
        width: "100%", padding: 17, border: "none", borderRadius: 14, cursor: canSearch ? "pointer" : "default",
        background: canSearch ? t.accent : t.tagBg,
        color: canSearch ? "#fff" : t.textMuted,
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
```

}

// ========= LOADING =========
if (screen === “loading”) {
const msgs = [“近くの居酒屋を検索しています”, “営業中のお店に絞り込んでいます”, “AIがおすすめを選んでいます”];
return (
<div style={{ …pageBase, display: “flex”, alignItems: “center”, justifyContent: “center” }}>
<div style={{ textAlign: “center”, padding: 32 }}>
<div style={{
width: 48, height: 48, margin: “0 auto 32px”,
border: `2.5px solid ${t.tagBg}`, borderTop: `2.5px solid ${t.accent}`,
borderRadius: “50%”, animation: “spin 1s linear infinite”,
}} />
<div style={{ display: “flex”, flexDirection: “column”, gap: 18 }}>
{msgs.map((msg, i) => (
<div key={i} style={{
fontSize: 14, fontWeight: 500,
color: animStage >= i ? t.text : t.textMuted,
transition: “color 0.5s”,
display: “flex”, alignItems: “center”, gap: 10, justifyContent: “center”,
}}>
{animStage > i && <span style={{ color: t.green, fontSize: 14 }}>✓</span>}
{animStage === i && <span style={{ width: 6, height: 6, borderRadius: “50%”, background: t.accent, animation: “pulse 1s ease-in-out infinite” }} />}
{animStage < i && <span style={{ width: 6, height: 6, borderRadius: “50%”, background: t.tagBg }} />}
{msg}
</div>
))}
</div>
</div>
<style>{gStyle}</style>
</div>
);
}

// ========= RESULTS =========
return (
<div style={pageBase}>
<div style={{ maxWidth: 400, margin: “0 auto”, padding: “24px 20px 48px” }}>

```
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
      <button onClick={reset} style={{
        background: "#fff", border: `1px solid ${t.cardBorder}`,
        color: t.textSub, padding: "7px 14px", borderRadius: 8, cursor: "pointer",
        fontSize: 12, fontWeight: 600, fontFamily: "inherit",
      }}>← 条件を変える</button>
      <div style={{ fontSize: 12, color: t.textMuted }}>{aiResult?.places?.length || 0}件</div>
    </div>

    {/* Chips */}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 22 }}>
      {[
        "徒歩8分圏内", "★ 3.8以上", "営業中のみ",
        SIZE_OPTIONS.find(s => s.key === groupSize)?.label,
        smoking === true ? "喫煙OK" : smoking === false ? "禁煙" : null,
        ...(budgets.length > 0 ? budgets.map(b => b) : []),
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
      <div style={{
        padding: "16px 20px", borderRadius: 14, marginBottom: 24,
        background: "#fff", border: `1px solid ${t.cardBorder}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
            background: t.accentLight, color: t.accent, letterSpacing: 0.5,
          }}>AI</span>
        </div>
        <p style={{ fontSize: 14, margin: 0, lineHeight: 1.8, color: t.textSub }}>{aiResult.summary}</p>
      </div>
    )}

    {/* Cards */}
    {aiResult?.rankings?.map((rec, idx) => {
      const place = getPlace(rec.name);
      if (!place) return null;
      const isTop = idx === 0;

      return (
        <div key={rec.name} style={{
          padding: 20, borderRadius: 16, marginBottom: 12,
          background: "#fff",
          border: isTop ? `1.5px solid ${t.accentSoft}` : `1px solid ${t.cardBorder}`,
          boxShadow: isTop ? "0 4px 20px rgba(196,149,106,0.08)" : "0 1px 4px rgba(0,0,0,0.03)",
          animation: `fadeUp 0.4s ease ${idx * 0.06}s both`,
        }}>
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

              {/* 営業中バッジ */}
              <div style={{ marginBottom: 8 }}>
                <OpenBadge close={place.hours_close} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                <Stars rating={place.rating} />
                <span style={{ fontSize: 11, color: t.textMuted }}>({place.reviews}件)</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <Tag
                  color={place.price === "安い" ? "#6A9E6E" : place.price === "高い" ? "#9E7BB8" : t.amber}
                  bg={place.price === "安い" ? t.greenBg : place.price === "高い" ? "#F3EFF8" : t.amberBg}
                >{place.price}</Tag>
                <Tag
                  color={place.smoking ? "#C49A6A" : "#7BA3AE"}
                  bg={place.smoking ? t.accentLight : "#EDF4F6"}
                >{place.smoking ? "喫煙OK" : "禁煙"}</Tag>
                <Tag>{place.distance}</Tag>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 12, paddingLeft: 50, lineHeight: 1.7 }}>
            {place.hours_open}〜{formatCloseTime(place.hours_close)}　{place.address}
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

          <button style={{
            marginTop: 12, width: "100%", padding: 10, borderRadius: 8, cursor: "pointer",
            background: t.bg, border: `1px solid ${t.cardBorder}`,
            color: t.textSub, fontSize: 12, fontWeight: 600, textAlign: "center",
            fontFamily: "inherit",
          }}>Google Map で開く →</button>
        </div>
      );
    })}

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
```

);
}

const gStyle = `
@import url(‘https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700;800&display=swap’);

- { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
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
