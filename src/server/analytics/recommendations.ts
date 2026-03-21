import {
  DriverItem,
  HotelAggregate,
  Recommendation,
  RecommendationCategory,
  RecommendationPriority,
  SegmentId,
  TopicId
} from "@/entities/types";
import { createId } from "@/shared/lib/id";

interface RecommendationSeed {
  category: RecommendationCategory;
  priority: RecommendationPriority;
  title: string;
  description: string;
  rationale: string;
  relatedSegments: SegmentId[];
  relatedTopics: TopicId[];
  impactScore: number;
  effortScore: number;
}

export function buildRecommendations(
  hotelId: string,
  aggregate: HotelAggregate
): Recommendation[] {
  const recommendations: RecommendationSeed[] = [];

  const businessSegment = aggregate.segmentDistribution.find(
    (item) => item.id === "business_traveler"
  );
  const wifiPositive = hasPositiveDriver(aggregate.positiveDrivers, "wifi");
  const locationPositive = hasPositiveDriver(aggregate.positiveDrivers, "location");

  if (businessSegment && businessSegment.share > 0.25 && (wifiPositive || locationPositive)) {
    recommendations.push({
      category: "marketing",
      priority: "high",
      title: "Усилить позиционирование под бизнес-гостей",
      description:
        "Сфокусировать коммуникацию на факторах, которые бизнес-сегмент стабильно оценивает высоко.",
      rationale:
        "Высокая доля business traveler + подтвержденные позитивные драйверы по Wi-Fi/расположению.",
      relatedSegments: ["business_traveler"],
      relatedTopics: ["wifi", "location", "business_infrastructure"],
      impactScore: 8.8,
      effortScore: 4.2
    });
  }

  const checkinNegative = hasNegativeDriver(aggregate.negativeDrivers, "checkin_checkout");
  if (checkinNegative) {
    recommendations.push({
      category: "operations",
      priority: "high",
      title: "Оптимизировать check-in/check-out процесс",
      description:
        "Сократить время регистрации и очередь в пиковые часы, внедрить fast-lane для повторных гостей.",
      rationale:
        "Тема заселения входит в топ негативных драйверов и влияет на оценку первых впечатлений.",
      relatedSegments: ["business_traveler", "transit_guest"],
      relatedTopics: ["checkin_checkout", "service"],
      impactScore: 9.1,
      effortScore: 6.5
    });
  }

  const parkingMixed =
    aggregate.topicDistribution.find((topic) => topic.topic === "parking")?.riskLevel !==
    "low";
  if (parkingMixed) {
    recommendations.push({
      category: "operations",
      priority: "medium",
      title: "Стабилизировать опыт парковки и коммуникацию",
      description:
        "Добавить навигацию, прозрачные правила доступа и предзаказ места при высокой загрузке.",
      rationale:
        "Парковка часто упоминается и имеет mixed/negative сигналы в части отзывов.",
      relatedSegments: ["transit_guest", "family", "business_traveler"],
      relatedTopics: ["parking", "location"],
      impactScore: 7.4,
      effortScore: 5.4
    });
  }

  const cleanlinessStrong = hasPositiveDriver(aggregate.positiveDrivers, "cleanliness");
  const serviceStrong = hasPositiveDriver(aggregate.positiveDrivers, "service");
  if (cleanlinessStrong && serviceStrong) {
    recommendations.push({
      category: "marketing",
      priority: "medium",
      title: "Вынести темы чистоты и сервиса в коммерческие сообщения",
      description:
        "Обновить карточки объекта, рекламные креативы и сайт акцентом на подтвержденные преимущества.",
      rationale:
        "Стабильно позитивные темы повышают лояльность, но часто недоиспользуются в маркетинге.",
      relatedSegments: ["business_traveler", "family", "couple"],
      relatedTopics: ["cleanliness", "service", "staff"],
      impactScore: 8,
      effortScore: 3.8
    });
  }

  if (aggregate.keyRisks.length > 0) {
    recommendations.push({
      category: "reputation",
      priority: "high",
      title: "Запустить недельный цикл антикризисного мониторинга",
      description:
        "Контролировать risk-темы ежедневно, эскалировать инциденты и отслеживать динамику после мер.",
      rationale: `Зафиксированы риск-сигналы: ${aggregate.keyRisks.slice(0, 2).join("; ")}.`,
      relatedSegments: ["mixed", "unclassified"],
      relatedTopics: aggregate.negativeDrivers.slice(0, 3).map((driver) => driver.topic),
      impactScore: 8.4,
      effortScore: 4.9
    });
  }

  if (!recommendations.length) {
    recommendations.push({
      category: "strategy",
      priority: "medium",
      title: "Расширить выборку и стабилизировать сигналы",
      description:
        "Для устойчивых управленческих выводов увеличьте объем отзывов и частоту анализа.",
      rationale:
        "Текущая выборка не дает выраженных критичных драйверов, необходимо наращивать данные.",
      relatedSegments: ["unclassified"],
      relatedTopics: [],
      impactScore: 6.1,
      effortScore: 3.2
    });
  }

  return recommendations
    .slice(0, 8)
    .map((item) => ({
      id: createId("rec"),
      hotelId,
      category: item.category,
      priority: item.priority,
      title: item.title,
      description: item.description,
      rationale: item.rationale,
      relatedSegments: item.relatedSegments,
      relatedTopics: item.relatedTopics,
      impactScore: item.impactScore,
      effortScore: item.effortScore,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }))
    .sort((a, b) => scorePriority(b) - scorePriority(a));
}

function hasPositiveDriver(drivers: DriverItem[], topic: TopicId): boolean {
  return drivers.some((driver) => driver.topic === topic && driver.score > 0.25);
}

function hasNegativeDriver(drivers: DriverItem[], topic: TopicId): boolean {
  return drivers.some((driver) => driver.topic === topic && driver.score > 0.2);
}

function scorePriority(rec: { priority: RecommendationPriority; impactScore: number }): number {
  const priorityWeight =
    rec.priority === "high" ? 3 : rec.priority === "medium" ? 2 : 1;
  return priorityWeight * 10 + rec.impactScore;
}
