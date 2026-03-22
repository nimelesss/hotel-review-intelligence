import {
  DriverItem,
  HotelAggregate,
  Recommendation,
  RecommendationCategory,
  RecommendationPriority,
  RiskLevel,
  SegmentId,
  SegmentInsight,
  TopicDistributionItem,
  TopicId
} from "@/entities/types";
import { SEGMENT_LABELS, TOPIC_LABELS } from "@/shared/config/taxonomy";
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
  sortWeight: number;
}

const NEGATIVE_PLAYBOOK: Partial<
  Record<TopicId, { title: string; description: string; category: RecommendationCategory }>
> = {
  checkin_checkout: {
    title: "Сократить время заселения и выезда",
    description:
      "Перераспределить нагрузку на стойке регистрации, внедрить быстрый сценарий check-in/check-out и контроль SLA в пиковые часы.",
    category: "operations"
  },
  cleanliness: {
    title: "Закрыть разрывы в стандартах чистоты",
    description:
      "Пересобрать чек-листы хаускипинга по проблемным зонам и добавить выборочный контроль качества по негативным отзывам.",
    category: "operations"
  },
  service: {
    title: "Снизить сервисные сбои в гостевом пути",
    description:
      "Уточнить скрипты фронт-офиса, ввести контроль времени реакции на обращения и отдельный цикл разбора жалоб.",
    category: "operations"
  },
  wifi: {
    title: "Стабилизировать Wi-Fi в гостевых зонах",
    description:
      "Провести замер покрытия, устранить зоны слабого сигнала и добавить в коммуникации понятный канал эскалации проблемы.",
    category: "operations"
  },
  parking: {
    title: "Упорядочить клиентский путь по парковке",
    description:
      "Актуализировать навигацию и правила парковки, предусмотреть сценарий высокой загрузки и информирование до заезда.",
    category: "operations"
  },
  room: {
    title: "Снизить жалобы по состоянию номеров",
    description:
      "Приоритизировать дефекты по частоте упоминаний, ускорить цикл устранения и усилить предзаселительный контроль номера.",
    category: "operations"
  },
  sleep_comfort: {
    title: "Поднять комфорт сна",
    description:
      "Снизить ночной шум, стандартизировать качество матрасов/подушек и контролировать климат в номерах в ночное время.",
    category: "operations"
  },
  value_for_money: {
    title: "Сбалансировать ценность тарифа",
    description:
      "Проверить ценовые сценарии в чувствительных периодах и усилить пакетные предложения с явной дополнительной ценностью.",
    category: "strategy"
  }
};

const POSITIVE_MARKETING_PLAYBOOK: Partial<
  Record<TopicId, { title: string; description: string }>
> = {
  location: {
    title: "Усилить коммуникацию преимуществ локации",
    description:
      "Вынести транспортную доступность и ключевые точки притяжения в карточку объекта, рекламные материалы и коммерческие офферы."
  },
  cleanliness: {
    title: "Монетизировать сильный сигнал по чистоте",
    description:
      "Использовать тему чистоты как ядро доверия в маркетинговых сообщениях и в блоках конверсии на этапах выбора."
  },
  service: {
    title: "Тиражировать сильный сервис в позиционировании",
    description:
      "Подсветить высокий уровень сервиса в коммерческих коммуникациях и в стандартах бренда на внешних площадках."
  },
  breakfast: {
    title: "Подчеркнуть ценность завтрака",
    description:
      "Сделать завтрак отдельным продающим аргументом в карточке отеля и тарифной упаковке для ключевых сегментов."
  },
  business_infrastructure: {
    title: "Укрепить B2B-позиционирование для командировок",
    description:
      "Подсветить рабочую инфраструктуру, скорость интернета и гибкие условия заезда/выезда в деловых офферах."
  }
};

const TOPIC_EFFORT_BASE: Partial<Record<TopicId, number>> = {
  checkin_checkout: 6.4,
  cleanliness: 5.8,
  service: 5.7,
  wifi: 6.2,
  parking: 5.2,
  room: 6.5,
  sleep_comfort: 6.1,
  value_for_money: 4.8,
  business_infrastructure: 4.3,
  location: 3.7,
  breakfast: 4.5,
  staff: 4.9
};

export function buildRecommendations(hotelId: string, aggregate: HotelAggregate): Recommendation[] {
  const seeds: RecommendationSeed[] = [];

  addVolumeRecommendation(seeds, aggregate);
  addNegativeDriverRecommendations(seeds, aggregate);
  addRiskControlRecommendation(seeds, aggregate);
  addPositiveDriverRecommendations(seeds, aggregate);
  addSegmentRecommendations(seeds, aggregate);

  if (!seeds.length) {
    seeds.push({
      category: "strategy",
      priority: "medium",
      title: "Укрепить объем и регулярность аналитики",
      description:
        "Расширить покрытие отзывов и закрепить регулярный цикл анализа, чтобы решения опирались на устойчивую выборку.",
      rationale:
        "В текущей выборке недостаточно выраженных драйверов для приоритизации конкретных изменений.",
      relatedSegments: ["unclassified"],
      relatedTopics: [],
      impactScore: 6.2,
      effortScore: 3.1,
      sortWeight: 10
    });
  }

  const deduped = dedupeRecommendations(seeds);
  const now = new Date().toISOString();

  return deduped.slice(0, 8).map((seed) => ({
    id: createId("rec"),
    hotelId,
    category: seed.category,
    priority: seed.priority,
    title: seed.title,
    description: seed.description,
    rationale: seed.rationale,
    relatedSegments: seed.relatedSegments,
    relatedTopics: seed.relatedTopics,
    impactScore: toScore(seed.impactScore),
    effortScore: toScore(seed.effortScore),
    createdAt: now,
    updatedAt: now
  }));
}

function addVolumeRecommendation(seeds: RecommendationSeed[], aggregate: HotelAggregate) {
  if (aggregate.totalReviews >= 40) {
    return;
  }

  const sampleDeficit = Math.max(0, 40 - aggregate.totalReviews);
  seeds.push({
    category: "strategy",
    priority: aggregate.totalReviews < 20 ? "high" : "medium",
    title: "Увеличить объем отзывов для стабильной аналитики",
    description:
      "Усилить сбор отзывов по ключевым площадкам и довести выборку до объема, достаточного для устойчивых управленческих выводов.",
    rationale: `Текущий объем выборки (${aggregate.totalReviews}) ниже рабочего порога. До целевой базы не хватает примерно ${sampleDeficit} отзывов.`,
    relatedSegments: ["unclassified"],
    relatedTopics: [],
    impactScore: aggregate.totalReviews < 20 ? 8.6 : 7.2,
    effortScore: 4.2,
    sortWeight: aggregate.totalReviews < 20 ? 88 : 66
  });
}

function addNegativeDriverRecommendations(seeds: RecommendationSeed[], aggregate: HotelAggregate) {
  aggregate.negativeDrivers.slice(0, 3).forEach((driver) => {
    const topicMeta = aggregate.topicDistribution.find((item) => item.topic === driver.topic);
    if (!topicMeta) {
      return;
    }

    const playbook = NEGATIVE_PLAYBOOK[driver.topic];
    const riskWeight = riskToWeight(topicMeta.riskLevel);
    const impact = 5.6 + driver.mentionShare * 6 + riskWeight * 1.3 + Math.min(driver.score, 4) * 0.45;
    const effort = TOPIC_EFFORT_BASE[driver.topic] ?? 5.5;

    const category: RecommendationCategory =
      topicMeta.riskLevel === "high" ? "reputation" : playbook?.category ?? "operations";
    const priority = choosePriority(impact, topicMeta.riskLevel);

    const title = playbook?.title ?? `Снизить негатив по теме «${TOPIC_LABELS[driver.topic]}»`;
    const description =
      playbook?.description ??
      "Зафиксировать корневые причины негатива, назначить владельца процесса и контролировать динамику метрики после внедрения мер.";
    const rationale = buildNegativeRationale(driver, topicMeta);

    const relatedSegments = collectRelatedSegments(aggregate, driver.topic);

    seeds.push({
      category,
      priority,
      title,
      description,
      rationale,
      relatedSegments,
      relatedTopics: [driver.topic],
      impactScore: impact,
      effortScore: effort,
      sortWeight: priorityToWeight(priority) * 20 + impact
    });
  });
}

function addRiskControlRecommendation(seeds: RecommendationSeed[], aggregate: HotelAggregate) {
  if (!aggregate.keyRisks.length) {
    return;
  }

  const riskTopics = aggregate.topicDistribution
    .filter((topic) => topic.riskLevel === "high")
    .slice(0, 3)
    .map((topic) => topic.topic);

  const rationale = aggregate.keyRisks.slice(0, 3).join("; ");
  seeds.push({
    category: "reputation",
    priority: "high",
    title: "Запустить еженедельный контур репутационного контроля",
    description:
      "Ввести регулярный мониторинг риск-тем, SLA на разбор негативных кейсов и отчет по динамике после корректирующих действий.",
    rationale: `Выявлены устойчивые риск-сигналы: ${rationale}.`,
    relatedSegments: ["mixed", "unclassified"],
    relatedTopics: riskTopics,
    impactScore: 8.8,
    effortScore: 4.9,
    sortWeight: 96
  });
}

function addPositiveDriverRecommendations(seeds: RecommendationSeed[], aggregate: HotelAggregate) {
  aggregate.positiveDrivers.slice(0, 2).forEach((driver) => {
    if (driver.mentionShare < 0.09) {
      return;
    }

    const playbook = POSITIVE_MARKETING_PLAYBOOK[driver.topic];
    const dominantSegment = aggregate.segmentDistribution[0]?.id ?? "unclassified";
    const title = playbook?.title ?? `Усилить маркетинговую коммуникацию темы «${TOPIC_LABELS[driver.topic]}»`;
    const description =
      playbook?.description ??
      "Сделать подтвержденный сильный фактор частью коммерческой коммуникации и конверсионных точек карточки объекта.";
    const rationale = `Тема «${driver.label}» стабильно поддерживает позитив: доля упоминаний ${(driver.mentionShare * 100).toFixed(1)}%, интегральная сила ${driver.score.toFixed(2)}.`;

    const impact = 5 + driver.mentionShare * 8 + Math.min(driver.score, 4) * 0.65;
    const priority: RecommendationPriority = impact >= 8.4 ? "high" : "medium";

    seeds.push({
      category: "marketing",
      priority,
      title,
      description,
      rationale,
      relatedSegments: [dominantSegment],
      relatedTopics: [driver.topic],
      impactScore: impact,
      effortScore: Math.max(2.8, (TOPIC_EFFORT_BASE[driver.topic] ?? 4.4) - 1),
      sortWeight: priorityToWeight(priority) * 20 + impact
    });
  });
}

function addSegmentRecommendations(seeds: RecommendationSeed[], aggregate: HotelAggregate) {
  const dominantSegment = aggregate.segmentDistribution[0];
  if (dominantSegment && dominantSegment.share >= 0.28 && dominantSegment.id !== "unclassified") {
    const dominantInsight = aggregate.segmentInsights.find(
      (item) => item.segment === dominantSegment.id
    );
    const highlightedTopics = (dominantInsight?.valuedTopics ?? []).slice(0, 2);
    seeds.push({
      category: "strategy",
      priority: dominantSegment.share >= 0.4 ? "high" : "medium",
      title: `Укрепить предложение для сегмента «${SEGMENT_LABELS[dominantSegment.id]}»`,
      description:
        "Синхронизировать продуктовые сценарии и коммерческие сообщения с ожиданиями доминирующей аудитории.",
      rationale: `Сегмент формирует ${(dominantSegment.share * 100).toFixed(1)}% отзывов и влияет на ключевую часть репутационного профиля объекта.`,
      relatedSegments: [dominantSegment.id],
      relatedTopics: highlightedTopics,
      impactScore: 6.8 + dominantSegment.share * 4.8,
      effortScore: 4.3,
      sortWeight: 72 + dominantSegment.share * 20
    });
  }

  const growthCandidate = pickGrowthSegment(aggregate.segmentInsights, aggregate.dominantSegment);
  if (!growthCandidate) {
    return;
  }

  seeds.push({
    category: "strategy",
    priority: growthCandidate.share >= 0.12 ? "medium" : "low",
    title: `Раскрыть потенциал сегмента «${SEGMENT_LABELS[growthCandidate.segment]}»`,
    description:
      "Проверить целевые офферы и сценарии коммуникации для сегмента с позитивной реакцией и пока ограниченной долей в структуре спроса.",
    rationale: `Сегмент показывает позитивный отклик (${growthCandidate.averageSentiment.toFixed(
      2
    )}), но занимает только ${(growthCandidate.share * 100).toFixed(1)}% выборки.`,
    relatedSegments: [growthCandidate.segment],
    relatedTopics: growthCandidate.valuedTopics.slice(0, 2),
    impactScore: 6.1 + growthCandidate.averageSentiment * 2.4,
    effortScore: 4.1,
    sortWeight: 54 + growthCandidate.averageSentiment * 10
  });
}

function collectRelatedSegments(aggregate: HotelAggregate, topic: TopicId): SegmentId[] {
  const segments = aggregate.segmentInsights
    .filter(
      (item) =>
        item.complaintTopics.includes(topic) || item.valuedTopics.includes(topic)
    )
    .map((item) => item.segment);

  if (segments.length) {
    return uniqueSegments(segments).slice(0, 3);
  }

  const dominant = aggregate.segmentDistribution[0]?.id;
  return dominant ? [dominant] : ["unclassified"];
}

function pickGrowthSegment(
  insights: SegmentInsight[],
  dominantSegment: SegmentId
): SegmentInsight | undefined {
  return insights
    .filter(
      (item) =>
        item.segment !== dominantSegment &&
        item.segment !== "mixed" &&
        item.segment !== "unclassified" &&
        item.share >= 0.04 &&
        item.share <= 0.22 &&
        item.averageSentiment > 0.12
    )
    .sort((a, b) => b.averageSentiment - a.averageSentiment)[0];
}

function buildNegativeRationale(driver: DriverItem, topicMeta: TopicDistributionItem): string {
  const negativeShare =
    topicMeta.mentions > 0 ? topicMeta.negativeMentions / topicMeta.mentions : 0;
  return `Тема «${driver.label}»: ${
    topicMeta.mentions
  } упоминаний, доля негатива ${(negativeShare * 100).toFixed(
    1
  )}%, уровень риска ${riskLabel(topicMeta.riskLevel)}.`;
}

function choosePriority(impact: number, risk: RiskLevel): RecommendationPriority {
  if (risk === "high" || impact >= 8.8) {
    return "high";
  }
  if (risk === "medium" || impact >= 7.2) {
    return "medium";
  }
  return "low";
}

function dedupeRecommendations(seeds: RecommendationSeed[]): RecommendationSeed[] {
  const unique = new Map<string, RecommendationSeed>();
  seeds.forEach((seed) => {
    const key = `${seed.category}|${seed.title.toLocaleLowerCase("ru-RU")}`;
    const existing = unique.get(key);
    if (!existing || seed.sortWeight > existing.sortWeight) {
      unique.set(key, seed);
    }
  });
  return [...unique.values()].sort((a, b) => b.sortWeight - a.sortWeight);
}

function uniqueSegments(items: SegmentId[]): SegmentId[] {
  return [...new Set(items)];
}

function priorityToWeight(priority: RecommendationPriority): number {
  if (priority === "high") {
    return 3;
  }
  if (priority === "medium") {
    return 2;
  }
  return 1;
}

function riskToWeight(risk: RiskLevel): number {
  if (risk === "high") {
    return 1;
  }
  if (risk === "medium") {
    return 0.6;
  }
  return 0.2;
}

function riskLabel(risk: RiskLevel): string {
  if (risk === "high") {
    return "высокий";
  }
  if (risk === "medium") {
    return "средний";
  }
  return "низкий";
}

function toScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const clamped = Math.min(10, Math.max(0, value));
  return Math.round(clamped * 10) / 10;
}

