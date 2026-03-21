import { Review, ReviewSource } from "@/entities/types";
import { preprocessReviewText } from "@/server/analytics/preprocess";

const now = new Date().toISOString();

function makeReview(input: {
  id: string;
  hotelId: string;
  source: ReviewSource;
  sourceReviewId?: string;
  reviewDate: string;
  rating: number;
  title?: string;
  text: string;
  language?: string;
  authorName?: string;
  stayTypeRaw?: string;
}): Review {
  return {
    id: input.id,
    hotelId: input.hotelId,
    source: input.source,
    sourceReviewId: input.sourceReviewId,
    reviewDate: input.reviewDate,
    rating: input.rating,
    title: input.title,
    text: input.text,
    cleanedText: preprocessReviewText(input.text).cleanedText,
    language: input.language ?? "ru",
    authorName: input.authorName,
    stayTypeRaw: input.stayTypeRaw,
    createdAt: now,
    updatedAt: now
  };
}

export const seedReviews: Review[] = [
  makeReview({
    id: "review-cr-001",
    hotelId: "hotel-courtyard-rostov",
    source: "booking.com",
    sourceReviewId: "bk-001",
    reviewDate: "2025-12-14T00:00:00.000Z",
    rating: 9.2,
    title: "Удобно в командировке",
    text: "Был в командировке. Отличный Wi-Fi, удобный рабочий стол, ранний завтрак. Заселение быстрое, персонал вежливый.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-002",
    hotelId: "hotel-courtyard-rostov",
    source: "yandex",
    reviewDate: "2025-12-18T00:00:00.000Z",
    rating: 8.8,
    text: "Для деловой поездки очень удобно: центр, конференц-зал, интернет стабильный. Номер чистый, спать комфортно.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-003",
    hotelId: "hotel-courtyard-rostov",
    source: "google",
    reviewDate: "2026-01-03T00:00:00.000Z",
    rating: 7.1,
    text: "Отель хороший, но на check-in была очередь почти 25 минут. После дороги это очень неудобно.",
    stayTypeRaw: "Transit"
  }),
  makeReview({
    id: "review-cr-004",
    hotelId: "hotel-courtyard-rostov",
    source: "booking.com",
    sourceReviewId: "bk-004",
    reviewDate: "2026-01-07T00:00:00.000Z",
    rating: 9.0,
    text: "Остановились семьей с ребенком, дали дополнительную кровать. Номер просторный, завтрак вкусный, персонал помог с такси.",
    stayTypeRaw: "Family"
  }),
  makeReview({
    id: "review-cr-005",
    hotelId: "hotel-courtyard-rostov",
    source: "ostrovok",
    reviewDate: "2026-01-10T00:00:00.000Z",
    rating: 8.4,
    text: "Были вдвоем на выходные. Уютно, хороший ресторан и приятная атмосфера. Вид из номера понравился.",
    stayTypeRaw: "Couple"
  }),
  makeReview({
    id: "review-cr-006",
    hotelId: "hotel-courtyard-rostov",
    source: "tripadvisor",
    reviewDate: "2026-01-12T00:00:00.000Z",
    rating: 6.5,
    text: "Парковка есть, но места мало и информация на въезде непонятная. На ресепшн объяснили не сразу.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-007",
    hotelId: "hotel-courtyard-rostov",
    source: "yandex",
    reviewDate: "2026-01-15T00:00:00.000Z",
    rating: 9.5,
    text: "Чисто, тихо, отличный сон. Матрас удобный, шумоизоляция хорошая. Для работы и отдыха идеальный вариант.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-008",
    hotelId: "hotel-courtyard-rostov",
    source: "google",
    reviewDate: "2026-01-18T00:00:00.000Z",
    rating: 5.9,
    text: "В номере было пыльно и кондиционер не работал. Персонал извинился, но проблему решили только утром.",
    stayTypeRaw: "Solo"
  }),
  makeReview({
    id: "review-cr-009",
    hotelId: "hotel-courtyard-rostov",
    source: "booking.com",
    sourceReviewId: "bk-009",
    reviewDate: "2026-01-20T00:00:00.000Z",
    rating: 8.9,
    text: "Приехал на форум в соседний конгресс-центр. Удобное расположение и хорошие переговорные комнаты.",
    stayTypeRaw: "Event"
  }),
  makeReview({
    id: "review-cr-010",
    hotelId: "hotel-courtyard-rostov",
    source: "booking.com",
    sourceReviewId: "bk-010",
    reviewDate: "2026-01-25T00:00:00.000Z",
    rating: 7.4,
    text: "На одну ночь по дороге. Заезд удобный, но ночью было шумно из коридора.",
    stayTypeRaw: "Transit"
  }),
  makeReview({
    id: "review-cr-011",
    hotelId: "hotel-courtyard-rostov",
    source: "manual_upload",
    reviewDate: "2026-02-01T00:00:00.000Z",
    rating: 8.6,
    text: "Сотрудники на ресепшн доброжелательные, check-out быстрый. По цене/качеству достойно.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-012",
    hotelId: "hotel-courtyard-rostov",
    source: "yandex",
    reviewDate: "2026-02-03T00:00:00.000Z",
    rating: 6.8,
    text: "Завтрак нормальный, но кофе часто заканчивался. Для 4 звезд ожидал более стабильный сервис.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-013",
    hotelId: "hotel-courtyard-rostov",
    source: "ostrovok",
    reviewDate: "2026-02-05T00:00:00.000Z",
    rating: 8.1,
    text: "Путешествовал один. В целом хорошо: номер чистый, интернет быстрый, локация удобная.",
    stayTypeRaw: "Solo"
  }),
  makeReview({
    id: "review-cr-014",
    hotelId: "hotel-courtyard-rostov",
    source: "google",
    reviewDate: "2026-02-10T00:00:00.000Z",
    rating: 9.3,
    text: "Свадьба проходила рядом, выбрали этот отель. Персонал помог с ранним заселением, сервис отличный.",
    stayTypeRaw: "Event"
  }),
  makeReview({
    id: "review-cr-015",
    hotelId: "hotel-courtyard-rostov",
    source: "tripadvisor",
    reviewDate: "2026-02-14T00:00:00.000Z",
    rating: 7.0,
    text: "Хороший отель, но вечером в ресторане долгое обслуживание и ограниченное меню.",
    stayTypeRaw: "Couple"
  }),
  makeReview({
    id: "review-cr-016",
    hotelId: "hotel-courtyard-rostov",
    source: "booking.com",
    sourceReviewId: "bk-016",
    reviewDate: "2026-02-18T00:00:00.000Z",
    rating: 9.1,
    text: "Очень чисто и тихо, завтрак начинается рано - удобно перед встречами. Вернусь еще.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-rk-001",
    hotelId: "hotel-riverpark-kazan",
    source: "booking.com",
    sourceReviewId: "rk-bk-001",
    reviewDate: "2026-01-06T00:00:00.000Z",
    rating: 8.7,
    text: "Приезжали семьей с детьми. Просторный номер, парковка рядом, персонал помог с детской кроваткой.",
    stayTypeRaw: "Family"
  }),
  makeReview({
    id: "review-rk-002",
    hotelId: "hotel-riverpark-kazan",
    source: "google",
    reviewDate: "2026-01-10T00:00:00.000Z",
    rating: 6.2,
    text: "Заселение медленное, на ресепшн очередь. В остальном номер нормальный.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-rk-003",
    hotelId: "hotel-riverpark-kazan",
    source: "yandex",
    reviewDate: "2026-01-15T00:00:00.000Z",
    rating: 9.0,
    text: "Был на конференции, отличная деловая инфраструктура и стабильный Wi-Fi.",
    stayTypeRaw: "Event"
  }),
  makeReview({
    id: "review-rk-004",
    hotelId: "hotel-riverpark-kazan",
    source: "tripadvisor",
    reviewDate: "2026-01-18T00:00:00.000Z",
    rating: 7.5,
    text: "Останавливались проездом на одну ночь. Заезд удобный, но ночью было слышно дорогу.",
    stayTypeRaw: "Transit"
  }),
  makeReview({
    id: "review-rk-005",
    hotelId: "hotel-riverpark-kazan",
    source: "ostrovok",
    reviewDate: "2026-01-22T00:00:00.000Z",
    rating: 8.9,
    text: "Вдвоем на выходные, понравилась атмосфера и ресторан. Локация возле набережной отличная.",
    stayTypeRaw: "Couple"
  }),
  makeReview({
    id: "review-rk-006",
    hotelId: "hotel-riverpark-kazan",
    source: "manual_upload",
    reviewDate: "2026-02-02T00:00:00.000Z",
    rating: 5.8,
    text: "Номер был грязный, уборка слабая, на просьбы реагировали медленно.",
    stayTypeRaw: "Solo"
  }),
  makeReview({
    id: "review-rk-007",
    hotelId: "hotel-riverpark-kazan",
    source: "booking.com",
    sourceReviewId: "rk-bk-007",
    reviewDate: "2026-02-08T00:00:00.000Z",
    rating: 8.4,
    text: "По цене/качеству хорошо, завтрак достойный, но парковка в выходные перегружена.",
    stayTypeRaw: "Family"
  }),
  makeReview({
    id: "review-rk-008",
    hotelId: "hotel-riverpark-kazan",
    source: "google",
    reviewDate: "2026-02-12T00:00:00.000Z",
    rating: 9.1,
    text: "Отличный сервис и доброжелательный персонал, быстро решают вопросы, рекомендую.",
    stayTypeRaw: "Business"
  })
];
