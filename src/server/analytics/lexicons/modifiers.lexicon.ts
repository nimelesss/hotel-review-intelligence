/**
 * Negation and intensifier lexicons for Russian hotel reviews.
 *
 * Negation window: checked within 3 tokens before a sentiment word.
 */

export const NEGATIONS = [
  "не",
  "нет",
  "ни",
  "без",
  "никогда",
  "никак",
  "нисколько",
  "ничуть",
  "нигде",
  "далеко не",
  "вовсе не",
  "отнюдь не",
  "не особо",
  "не очень",
  "не совсем",
  "не слишком",
  "не сказать",
  "вряд ли",
  "мало",
];

export const INTENSIFIERS: Record<string, number> = {
  очень: 1.3,
  крайне: 1.45,
  супер: 1.25,
  слишком: 1.3,
  максимально: 1.35,
  сильно: 1.2,
  совсем: 1.2,
  абсолютно: 1.4,
  невероятно: 1.4,
  чрезвычайно: 1.4,
  исключительно: 1.35,
  просто: 1.1,
  реально: 1.15,
  действительно: 1.2,
  безумно: 1.35,
  жутко: 1.3,
  дико: 1.25,
  ужасно: 1.3,   // "ужасно вкусно" = intensifier
  страшно: 1.2,  // "страшно удобно"
};

/** Window size for negation detection (tokens before sentiment word) */
export const NEGATION_WINDOW = 3;
