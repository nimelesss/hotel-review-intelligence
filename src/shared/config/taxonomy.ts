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
    description: "Уборка, гигиена, состояние номера и санузла",
    markers: ["чист", "уборк", "пыль", "гряз", "белье", "полотенц", "запах"]
  },
  {
    id: "service",
    label: "Сервис",
    description: "Качество обслуживания и клиентский опыт",
    markers: ["сервис", "обслуж", "помог", "решил", "отношен", "клиентоориент", "внимател"]
  },
  {
    id: "location",
    label: "Расположение",
    description: "Локация, транспортная доступность, окружение",
    markers: ["располож", "центр", "локаци", "рядом", "недалеко", "транспорт", "доступн"]
  },
  {
    id: "breakfast",
    label: "Завтрак",
    description: "Качество, разнообразие и график завтрака",
    markers: ["завтрак", "шведск", "кофе", "утрен", "меню", "ранний завтрак"]
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    description: "Скорость и стабильность интернет-соединения",
    markers: ["wifi", "wi-fi", "интернет", "сеть", "скорость", "подключен"]
  },
  {
    id: "parking",
    label: "Парковка",
    description: "Доступность парковочных мест и удобство заезда",
    markers: ["парковк", "паркинг", "машин", "авто", "место", "заезд"]
  },
  {
    id: "silence",
    label: "Тишина",
    description: "Шумоизоляция и акустический комфорт",
    markers: ["тихо", "тишин", "шум", "слышно", "сосед", "дорог", "звукоизоляц"]
  },
  {
    id: "room",
    label: "Номер",
    description: "Состояние, оснащение и площадь номера",
    markers: ["номер", "кровать", "ванн", "интерьер", "простор", "ремонт", "мебель"]
  },
  {
    id: "checkin_checkout",
    label: "Check-in / Check-out",
    description: "Скорость и качество процессов заселения и выезда",
    markers: ["заселен", "регистрац", "очеред", "check-in", "check out", "check-out", "выселен"]
  },
  {
    id: "restaurant_food",
    label: "Ресторан и питание",
    description: "Ресторан, бар, room service, качество блюд",
    markers: ["ресторан", "ужин", "обед", "еда", "кухн", "бар", "room service"]
  },
  {
    id: "value_for_money",
    label: "Цена и качество",
    description: "Восприятие стоимости относительно качества услуги",
    markers: ["цена", "стоим", "дорого", "выгод", "соотношен", "качество"]
  },
  {
    id: "business_infrastructure",
    label: "Деловая инфраструктура",
    description: "Условия для командировок, встреч и работы",
    markers: ["конференц", "переговор", "делов", "рабоч", "meeting", "презентац", "коворкинг"]
  },
  {
    id: "sleep_comfort",
    label: "Комфорт сна",
    description: "Матрас, подушки, климат в номере и качество сна",
    markers: ["сон", "матрас", "подушк", "спал", "кондиционер", "жарко ночью", "холодно ночью"]
  },
  {
    id: "staff",
    label: "Персонал",
    description: "Профессионализм, вежливость и скорость реакции команды",
    markers: ["персонал", "администратор", "сотрудник", "ресепшн", "вежлив", "доброжел", "менеджер"]
  }
];

export const SEGMENTS: SegmentDefinition[] = [
  {
    id: "business_traveler",
    label: "Бизнес-гость",
    description: "Командировка или деловая поездка"
  },
  {
    id: "family",
    label: "Семья",
    description: "Проживание с детьми или родственниками"
  },
  {
    id: "couple",
    label: "Пара",
    description: "Поездка вдвоем, выходные или отдых"
  },
  {
    id: "transit_guest",
    label: "Транзитный гость",
    description: "Короткая остановка в пути"
  },
  {
    id: "event_guest",
    label: "Гость мероприятия",
    description: "Поездка на форум, выставку, свадьбу или концерт"
  },
  {
    id: "solo_traveler",
    label: "Одиночный путешественник",
    description: "Индивидуальная поездка"
  },
  {
    id: "mixed",
    label: "Смешанный профиль",
    description: "Конкурирующие сигналы нескольких сегментов"
  },
  {
    id: "unclassified",
    label: "Недостаточно данных",
    description: "Маркеров недостаточно для уверенной сегментации"
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
