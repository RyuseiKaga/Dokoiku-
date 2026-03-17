/**
 * 閉店時刻までの残り時間テキストを返す
 */
export function timeUntilClose(close: string): string | null {
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const nowMin = hh * 60 + mm;

  const [ch, cm] = close.split(":").map(Number);
  let closeMin = ch * 60 + cm;

  // 翌日またぎ補正 (例: 02:00 → 26:00扱い)
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

/**
 * 閉店時刻の表示用フォーマット
 * 0:00〜5:00 → 翌0:00〜翌5:00
 */
export function formatCloseTime(close: string): string {
  const [h] = close.split(":").map(Number);
  if (h >= 0 && h <= 5) return `翌${close}`;
  return close;
}

/**
 * 閉店まで1時間以内かどうか
 */
export function isClosingSoon(close: string): boolean {
  const remaining = timeUntilClose(close);
  if (!remaining) return true;
  // "あとXX分" で60以下ならtrue
  const match = remaining.match(/あと(\d+)分/);
  if (match) return parseInt(match[1], 10) <= 60;
  return false;
}

/**
 * 予算フィルタ: ユーザーが選んだ予算帯に合致するか
 */
export function matchesBudget(
  priceLabel: "安い" | "普通" | "高い",
  selectedBudgets: string[]
): boolean {
  if (selectedBudgets.length === 0) return true; // 未選択=こだわらない
  return selectedBudgets.includes(priceLabel);
}

/**
 * キャパシティフィルタ:
 * - Google APIにはキャパ情報がないため、レビュー数で推定
 * - レビュー多い = 大箱の可能性高い
 */
export function matchesCapacity(
  reviews: number,
  groupSize: "small" | "medium" | "large" | null
): boolean {
  if (!groupSize) return true;
  // 大人数(10人以上)の場合、レビュー100件以下の小さな店は除外
  if (groupSize === "large" && reviews < 50) return false;
  return true;
}
