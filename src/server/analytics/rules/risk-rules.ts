import { TopicSentiment } from "@/entities/types";

interface RiskKeyword {
  pattern: RegExp;
  label: string;
  severity: "critical" | "high" | "medium";
}

const RISK_KEYWORDS: RiskKeyword[] = [
  // ── Критичные (reputation-destroying) ────────────────────────────────
  { pattern: /таракан/i, label: "насекомые в номере", severity: "critical" },
  { pattern: /клоп/i, label: "клопы в номере", severity: "critical" },
  { pattern: /насеком/i, label: "насекомые", severity: "critical" },
  { pattern: /плесен/i, label: "плесень", severity: "critical" },
  { pattern: /мошенн/i, label: "подозрение на мошенничество", severity: "critical" },
  { pattern: /обман/i, label: "подозрение на обман", severity: "critical" },
  { pattern: /вранье|врут/i, label: "подозрение на обман", severity: "critical" },
  { pattern: /отрав/i, label: "отравление", severity: "critical" },
  { pattern: /антисанитар/i, label: "антисанитария", severity: "critical" },
  { pattern: /полици|вызвал.{0,10}охран/i, label: "вызов полиции/охраны", severity: "critical" },
  { pattern: /кража|украл/i, label: "кража", severity: "critical" },
  { pattern: /небезопас/i, label: "ощущение небезопасности", severity: "critical" },

  // ── Высокие (urgent action needed) ───────────────────────────────────
  { pattern: /гряз/i, label: "грязь или некачественная уборка", severity: "high" },
  { pattern: /грязн/i, label: "грязные условия", severity: "high" },
  { pattern: /хамств/i, label: "хамство персонала", severity: "high" },
  { pattern: /хамит|хамил/i, label: "хамское поведение", severity: "high" },
  { pattern: /грубост|грубо обращ/i, label: "грубость персонала", severity: "high" },
  { pattern: /нагл/i, label: "наглость персонала", severity: "high" },
  { pattern: /скандал/i, label: "конфликтная ситуация", severity: "high" },
  { pattern: /неработ/i, label: "неработающее оборудование", severity: "high" },
  { pattern: /сломан/i, label: "сломанное оборудование", severity: "high" },
  { pattern: /протечк|течёт|течет/i, label: "протечка", severity: "high" },
  { pattern: /вонь|воняет/i, label: "неприятный запах", severity: "high" },
  { pattern: /затхл/i, label: "затхлый запах", severity: "high" },
  { pattern: /отказал.{0,10}заселен/i, label: "отказ в заселении", severity: "high" },
  { pattern: /не вернул.{0,10}деньг|не вернул.{0,10}средств/i, label: "невозврат средств", severity: "high" },
  { pattern: /не заселил/i, label: "проблемы с заселением", severity: "high" },
  { pattern: /повесили.{0,5}штраф|требовал.{0,10}деньг/i, label: "необоснованные штрафы", severity: "high" },
  { pattern: /выселил/i, label: "принудительное выселение", severity: "high" },
  { pattern: /просроч/i, label: "просроченные продукты", severity: "high" },

  // ── Средние (track and monitor) ──────────────────────────────────────
  { pattern: /шум.{0,5}ночь|шумно ночью/i, label: "ночной шум", severity: "medium" },
  { pattern: /слышно сосед/i, label: "плохая звукоизоляция", severity: "medium" },
  { pattern: /звукоизоляц/i, label: "проблемы звукоизоляции", severity: "medium" },
  { pattern: /долго ждал|ждали.{0,10}час/i, label: "долгое ожидание", severity: "medium" },
  { pattern: /очеред/i, label: "очереди", severity: "medium" },
  { pattern: /задержк/i, label: "задержки обслуживания", severity: "medium" },
  { pattern: /игнор/i, label: "игнорирование запросов", severity: "medium" },
  { pattern: /равнодуш/i, label: "равнодушие персонала", severity: "medium" },
  { pattern: /обшарпан|облезл/i, label: "ветхое состояние", severity: "medium" },
  { pattern: /уставш.{0,5}номер|убит.{0,5}номер/i, label: "изношенный номерной фонд", severity: "medium" },
  { pattern: /пятн.{0,5}на (бел|простын|полотен|стен)/i, label: "пятна на белье/стенах", severity: "medium" },
  { pattern: /волос.{0,5}(в|на) (ванн|душ|кроват|бел)/i, label: "волосы в номере", severity: "medium" },
  { pattern: /не убрал|не убирал/i, label: "не проведена уборка", severity: "medium" },
  { pattern: /холодн.{0,5}завтрак|холодн.{0,5}еда/i, label: "холодная еда", severity: "medium" },
  { pattern: /невкусн|безвкусн/i, label: "невкусная еда", severity: "medium" },
  { pattern: /однообразн/i, label: "однообразное меню", severity: "medium" },
  { pattern: /скудн.{0,5}(завтрак|меню|выбор)/i, label: "скудный выбор", severity: "medium" },
  { pattern: /кондиционер.{0,10}не работ/i, label: "нерабочий кондиционер", severity: "medium" },
  { pattern: /жарко/i, label: "жарко в номере", severity: "medium" },
  { pattern: /переоцен/i, label: "переоценённый отель", severity: "medium" },
  { pattern: /не стоит/i, label: "не стоит своих денег", severity: "medium" },
  { pattern: /не соответств/i, label: "не соответствует заявленному", severity: "medium" },
];

export function detectRiskFlags(loweredText: string, topics: TopicSentiment[]): string[] {
  const flags: string[] = [];

  RISK_KEYWORDS.forEach((keyword) => {
    if (keyword.pattern.test(loweredText)) {
      const prefix = keyword.severity === "critical"
        ? "⚠ Критичный"
        : keyword.severity === "high"
        ? "Высокий"
        : "Маркер";
      flags.push(`${prefix}: ${keyword.label}`);
    }
  });

  const negativeTopics = topics.filter(
    (topic) => topic.sentimentLabel === "negative" && topic.confidence > 0.5
  );
  negativeTopics.forEach((topic) => {
    if (topic.topic === "checkin_checkout") {
      flags.push("Риск просадки оценки из-за процессов заселения/выезда");
    }
    if (topic.topic === "cleanliness") {
      flags.push("Репутационный риск по теме чистоты");
    }
    if (topic.topic === "staff") {
      flags.push("Риск жалоб на персонал");
    }
    if (topic.topic === "silence") {
      flags.push("Риск по шумоизоляции");
    }
  });

  return unique(flags).slice(0, 8);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
