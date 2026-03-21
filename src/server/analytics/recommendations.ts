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

export function buildRecommendations(hotelId: string, aggregate: HotelAggregate): Recommendation[] {
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
      title: "Усилить позиционирование для бизнес-гостей",
      description:
        "Сфокусировать коммерческие сообщения на преимуществах, которые бизнес-аудитория стабильно оценивает высоко.",
      rationale:
        "Высокая доля бизнес-гостей и сильные позитивные сигналы по Wi-Fi/расположению.",
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
      title: "Оптимизировать процессы заселения и выезда",
      description:
        "Сократить очереди и время регистрации в часы пик, добавить быстрый сценарий для повторных гостей.",
      rationale:
        "Тема check-in/check-out входит в ключевые негативные драйверы и влияет на первое впечатление.",
      relatedSegments: ["business_traveler", "transit_guest"],
      relatedTopics: ["checkin_checkout", "service"],
      impactScore: 9.1,
      effortScore: 6.5
    });
  }

  const parkingMixed =
    aggregate.topicDistribution.find((topic) => topic.topic === "parking")?.riskLevel !== "low";
  if (parkingMixed) {
    recommendations.push({
      category: "operations",
      priority: "medium",
      title: "Стабилизировать клиентский путь по парковке",
      description:
        "Уточнить навигацию, правила доступа и сценарий на период высокой загрузки парковки.",
      rationale:
        "Тема парковки часто упоминается и имеет смешанный или негативный профиль.",
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
      title: "Усилить коммуникацию сильных сторон сервиса",
      description:
        "Вывести темы чистоты и сервиса в карточки отеля, рекламные материалы и бренд-коммуникацию.",
      rationale:
        "Стабильно позитивные сигналы по чистоте и сервису повышают лояльность, но часто недоиспользуются в маркетинге.",
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
      title: "Ввести недельный контур репутационного контроля",
      description:
        "Поставить риск-темы на регулярный контроль и отслеживать динамику после корректирующих действий.",
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
      title: "Увеличить объем отзывов и частоту обновления",
      description:
        "Для более устойчивых выводов расширьте сбор отзывов и зафиксируйте регулярный цикл анализа.",
      rationale:
        "Текущая выборка не содержит выраженных критичных драйверов, необходима дополнительная статистика.",
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
  const priorityWeight = rec.priority === "high" ? 3 : rec.priority === "medium" ? 2 : 1;
  return priorityWeight * 10 + rec.impactScore;
}
