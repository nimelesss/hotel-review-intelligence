import { TopicSentiment } from "@/entities/types";

const HIGH_RISK_KEYWORDS = [
  { marker: "гряз", label: "грязь или некачественная уборка" },
  { marker: "хамств", label: "хамство персонала" },
  { marker: "скандал", label: "конфликтная ситуация" },
  { marker: "небезопас", label: "ощущение небезопасности" },
  { marker: "обман", label: "подозрение на обман" },
  { marker: "неработ", label: "неработающий сервис или оборудование" }
];

export function detectRiskFlags(loweredText: string, topics: TopicSentiment[]): string[] {
  const flags: string[] = [];

  HIGH_RISK_KEYWORDS.forEach((keyword) => {
    if (loweredText.includes(keyword.marker)) {
      flags.push(`Критичный маркер: ${keyword.label}`);
    }
  });

  const negativeTopics = topics.filter(
    (topic) => topic.sentimentLabel === "negative" && topic.confidence > 0.6
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
  });

  return unique(flags).slice(0, 5);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
