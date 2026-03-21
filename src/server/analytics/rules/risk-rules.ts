import { TopicSentiment } from "@/entities/types";

const HIGH_RISK_KEYWORDS = [
  "гряз",
  "хамств",
  "скандал",
  "небезопас",
  "обман",
  "неработ"
];

export function detectRiskFlags(
  loweredText: string,
  topics: TopicSentiment[]
): string[] {
  const flags: string[] = [];

  HIGH_RISK_KEYWORDS.forEach((keyword) => {
    if (loweredText.includes(keyword)) {
      flags.push(`Критичный маркер: ${keyword}`);
    }
  });

  const negativeTopics = topics.filter(
    (topic) => topic.sentimentLabel === "negative" && topic.confidence > 0.6
  );
  negativeTopics.forEach((topic) => {
    if (topic.topic === "checkin_checkout") {
      flags.push("Риск просадки NPS из-за заселения/выезда");
    }
    if (topic.topic === "cleanliness") {
      flags.push("Риск репутации по теме чистоты");
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
