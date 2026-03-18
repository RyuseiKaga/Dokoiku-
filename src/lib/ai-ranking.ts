import { Izakaya, SearchConditions, AiResult, AiRanking } from "../types";
import { timeUntilClose } from "./utils";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Claude API でお店のランキングを生成
 */
export async function rankWithAI(
  places: Izakaya[],
  conditions: SearchConditions
): Promise<AiResult> {
  if (places.length === 0) {
    return { rankings: [], summary: "条件に合う営業中のお店が見つかりませんでした", places };
  }

  const sizeLabels: Record<string, string> = {
    small: "数人（2〜4人）",
    medium: "8人くらい（5〜10人）",
    large: "大人数（10人以上）",
  };
  const sizeLabel = conditions.groupSize ? sizeLabels[conditions.groupSize] : "不明";
  const budgetLabel = conditions.budgets.length > 0 ? conditions.budgets.join("・") : "指定なし";
  const smokingLabel =
    conditions.smoking === true
      ? "喫煙可の店のみ"
      : conditions.smoking === false
        ? "禁煙の店のみ"
        : "どちらでもOK";

  const placesInfo = places
    .map((p) => {
      const remaining = p.close_time ? timeUntilClose(p.close_time) : "不明";
      const smokingLabel =
        p.smoking === "no_smoking" ? "全席禁煙" :
        p.smoking === "smoking" ? "全席喫煙" :
        p.smoking === "partial" ? "喫煙席あり" : "喫煙不明";
      const extras: string[] = [];
      if (p.hp_has_free_drink) extras.push("飲み放題あり");
      if (p.hp_has_private_room) extras.push("個室あり");
      if (p.hp_capacity) extras.push(`席数${p.hp_capacity}席`);
      if (p.hp_vacancy !== undefined) extras.push("HP空席確認済");
      const extraStr = extras.length > 0 ? `, ${extras.join(", ")}` : "";
      return `${p.name} - 徒歩${p.walk_minutes}分, 評価${p.rating}(${p.reviews}件), ${p.price_label}, ${smokingLabel}, 閉店まで${remaining || "不明"}${extraStr}`;
    })
    .join("\n");

  const prompt = `あなたは飲み会の二次会・三次会探しのプロです。以下の条件で、候補の居酒屋からベストな順にランキングしてください。全ての候補店を順位付けしてください。閉店時間が近い店は順位を下げてください。喫煙条件が指定されている場合は喫煙情報を重視してください（HP情報がある場合は正確です）。

【条件】
- 人数: ${sizeLabel}
- 予算: ${budgetLabel}
- 喫煙: ${smokingLabel}
- 前提: 徒歩8分圏内の居酒屋、Google評価3.8以上、現在営業中の店のみ

【候補店】
${placesInfo}

以下のJSON形式のみで返してください。他のテキストやMarkdownは不要です。
{"rankings":[{"name":"店名（候補店から正確に）","rank":1,"reason":"推薦理由。条件にどうマッチしてるか具体的に。40文字以内。フレンドリーな口調で","highlight":"推しポイント15文字以内"}],"summary":"検索結果まとめ。60文字以内。フレンドリーに"}`;

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
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.map((i: any) => i.text || "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return { ...parsed, places };
  } catch (error) {
    console.error("AI ranking error:", error);
    return fallbackRanking(places);
  }
}

/**
 * API失敗時のフォールバック: 評価順 + 距離でランキング
 */
function fallbackRanking(places: Izakaya[]): AiResult {
  const sorted = [...places].sort((a, b) => {
    // 評価の差が0.3以上ならそちらを優先、それ以外は距離で
    if (Math.abs(a.rating - b.rating) >= 0.3) return b.rating - a.rating;
    return a.walk_minutes - b.walk_minutes;
  });

  const rankings: AiRanking[] = sorted.map((p, i) => ({
    name: p.name,
    rank: i + 1,
    reason:
      i === 0
        ? "評価と距離のバランスが一番！迷ったらここ"
        : i === 1
          ? "こちらも好評価。駅近で入りやすいお店です"
          : "穴場的な存在。空いてる可能性も",
    highlight:
      i === 0 ? "いちばんのおすすめ" : i === 1 ? "アクセス良好" : "穴場",
  }));

  return {
    rankings,
    summary: `営業中の居酒屋${places.length}件を評価順に並べました`,
    places,
  };
}
