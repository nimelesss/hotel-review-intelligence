import { PageHeader } from "@/shared/ui/page-header";
import { Card, CardTitle } from "@/shared/ui/card";

const SECTIONS = [
  {
    title: "1. Data Ingestion",
    items: [
      "Поддержка MVP: CSV и JSON upload, seed data, mock API.",
      "Pipeline: upload -> validate -> normalize -> dedupe -> store -> analyze -> aggregate.",
      "Сохраняются оригинальный текст, cleaned text и source-метаданные."
    ]
  },
  {
    title: "2. Preprocessing",
    items: [
      "Очистка шума, нормализация регистра, токенизация и marker extraction.",
      "Ядро MVP оптимизировано под русскоязычные отзывы с расширяемой архитектурой для multilingual."
    ]
  },
  {
    title: "3. Sentiment Model",
    items: [
      "Explainable hybrid: lexicon markers + negation handling + intensity modifiers + rating adjustment.",
      "Классы: positive / neutral / negative.",
      "Рейтинг является дополнительным сигналом, но не единственным фактором."
    ]
  },
  {
    title: "4. Topic Model",
    items: [
      "Контролируемая taxonomy из 14 операционных тем (чистота, сервис, Wi-Fi, check-in и т.д.).",
      "Каждый отзыв может получить несколько тем с topic-level sentiment."
    ]
  },
  {
    title: "5. Segment Model",
    items: [
      "Вероятностная сегментация по маркерам и контекстным признакам.",
      "Сегменты MVP: business, family, couple, transit, event, solo + mixed/unclassified.",
      "Система не определяет персональные характеристики человека, а оценивает вероятностный профиль отзыва."
    ]
  },
  {
    title: "6. Explainability",
    items: [
      "Для каждого отзыва доступны evidence markers, rationale и confidence.",
      "Отдельно показываются факты, вероятности и управленческие интерпретации."
    ]
  },
  {
    title: "7. Recommendation Engine",
    items: [
      "Rule-based рекомендации по категориям: marketing, operations, reputation, strategy.",
      "Каждая рекомендация содержит приоритет, impact, effort и прозрачное rationale."
    ]
  },
  {
    title: "8. Model Limitations",
    items: [
      "Система не является black-box нейросетью и не заявляет магическую точность.",
      "Качество выводов зависит от объема и качества входных данных.",
      "Результаты предназначены для поддержки управленческих решений, а не для автоматических санкций по персоналу."
    ]
  }
];

export default function MethodologyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Methodology"
        badge="Explainable Analytics"
        subtitle="Прозрачная методология аналитики отзывов для гостиничного менеджмента."
      />

      <div className="grid gap-4">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardTitle title={section.title} />
            <ul className="space-y-2 text-sm text-text">
              {section.items.map((item) => (
                <li
                  key={item}
                  className="rounded-lg border border-border bg-panelMuted px-3 py-2"
                >
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
