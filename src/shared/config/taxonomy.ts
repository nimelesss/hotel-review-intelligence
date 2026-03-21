import { SegmentId, TopicId } from "@/entities/types";

export interface TopicDefinition {
  id: TopicId;
  label: string;
  description: string;
  markers: string[];
}

export interface SegmentDefinition {
  id: SegmentId;
  label: string;
  description: string;
}

export const TOPICS: TopicDefinition[] = [
  {
    id: "cleanliness",
    label: "Чистота",
    description: "Уборка, гигиена, состояние номера",
    markers: ["чист", "уборк", "пыль", "гряз", "свеж", "белье", "полотенц"]
  },
  {
    id: "service",
    label: "Сервис",
    description: "Качество обслуживания и коммуникации",
    markers: ["сервис", "обслуж", "помог", "решил", "подсказ", "отношен", "клиентоориент"]
  },
  {
    id: "location",
    label: "Расположение",
    description: "Локация и транспортная доступность",
    markers: ["располож", "центр", "локац", "удобно добрат", "рядом", "недалеко", "доступн"]
  },
  {
    id: "breakfast",
    label: "Завтрак",
    description: "Качество и удобство завтрака",
    markers: ["завтрак", "шведск", "утрен", "кофе", "меню утра", "ранний завтрак"]
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    description: "Интернет и качество соединения",
    markers: ["wifi", "wi-fi", "интернет", "сеть", "скорость", "подключен"]
  },
  {
    id: "parking",
    label: "Парковка",
    description: "Парковка и доступ на авто",
    markers: ["парковк", "паркинг", "машин", "авто", "место на парковке", "заезд"]
  },
  {
    id: "silence",
    label: "Тишина",
    description: "Шум/тишина в номере",
    markers: ["тихо", "тишин", "шум", "слышно", "сосед", "дорог", "звукоизоляц"]
  },
  {
    id: "room",
    label: "Номер",
    description: "Состояние и оснащение номера",
    markers: ["номер", "кровать", "ванн", "интерьер", "простор", "ремонт", "мебель"]
  },
  {
    id: "checkin_checkout",
    label: "Check-in / Check-out",
    description: "Скорость и качество заселения/выезда",
    markers: ["заселен", "check-in", "check in", "check-out", "check out", "очередь", "регистрац", "выселен"]
  },
  {
    id: "restaurant_food",
    label: "Ресторан / Питание",
    description: "Ресторан, еда, room-service",
    markers: ["ресторан", "ужин", "обед", "еда", "кухн", "room service", "бар"]
  },
  {
    id: "value_for_money",
    label: "Цена / Качество",
    description: "Оценка стоимости относительно качества",
    markers: ["цена", "стоим", "дорого", "выгод", "качество", "соотношен"]
  },
  {
    id: "business_infrastructure",
    label: "Деловая инфраструктура",
    description: "Рабочее пространство, конференции, бизнес-удобства",
    markers: ["конференц", "переговор", "рабоч", "стол", "делов", "meeting", "презентац"]
  },
  {
    id: "sleep_comfort",
    label: "Комфорт сна",
    description: "Качество сна, матрасы, подушки, климат",
    markers: ["сон", "матрас", "подушк", "спал", "кондиционер", "жарко ночью", "холодно ночью"]
  },
  {
    id: "staff",
    label: "Персонал",
    description: "Профессионализм и вежливость команды",
    markers: ["персонал", "администратор", "сотрудник", "ресепшн", "вежлив", "доброжелат", "менеджер"]
  }
];

export const SEGMENTS: SegmentDefinition[] = [
  {
    id: "business_traveler",
    label: "Бизнес-гость",
    description: "Гость в деловой поездке"
  },
  {
    id: "family",
    label: "Семья",
    description: "Проживание с детьми/семьей"
  },
  {
    id: "couple",
    label: "Пара",
    description: "Поездка вдвоем и leisure-сценарий"
  },
  {
    id: "transit_guest",
    label: "Транзитный гость",
    description: "Остановка по дороге, short stay"
  },
  {
    id: "event_guest",
    label: "Участник мероприятия",
    description: "Поездка под ивент/форум/событие"
  },
  {
    id: "solo_traveler",
    label: "Одиночный путешественник",
    description: "Путешествие в одиночку"
  },
  {
    id: "mixed",
    label: "Смешанный профиль",
    description: "Несколько сегментов без явного доминирования"
  },
  {
    id: "unclassified",
    label: "Недостаточно данных",
    description: "Не хватает признаков для надежной классификации"
  }
];

export const SENTIMENT_LABELS: Record<string, string> = {
  positive: "Позитив",
  neutral: "Нейтрально",
  negative: "Негатив"
};

export const RISK_LABELS = {
  low: "Низкий риск",
  medium: "Средний риск",
  high: "Высокий риск"
} as const;

export const SEGMENT_LABELS: Record<SegmentId, string> = Object.fromEntries(
  SEGMENTS.map((segment) => [segment.id, segment.label])
) as Record<SegmentId, string>;

export const TOPIC_LABELS: Record<TopicId, string> = Object.fromEntries(
  TOPICS.map((topic) => [topic.id, topic.label])
) as Record<TopicId, string>;
