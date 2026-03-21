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
    source: "yandex",
    reviewDate: "2026-01-08T00:00:00.000Z",
    rating: 9.2,
    title: "Удобно для командировки",
    text: "Был в командировке. Стабильный Wi-Fi, удобный рабочий стол и быстрый check-in.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-002",
    hotelId: "hotel-courtyard-rostov",
    source: "2gis",
    reviewDate: "2026-01-11T00:00:00.000Z",
    rating: 7.1,
    text: "В целом хорошо, но вечером была очередь на ресепшн и заселение заняло около 20 минут.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-003",
    hotelId: "hotel-courtyard-rostov",
    source: "ostrovok",
    reviewDate: "2026-01-15T00:00:00.000Z",
    rating: 8.6,
    text: "Останавливались семьей. Просторный номер, вежливый персонал, детям дали допкровать.",
    stayTypeRaw: "Family"
  }),
  makeReview({
    id: "review-cr-004",
    hotelId: "hotel-courtyard-rostov",
    source: "2gis",
    reviewDate: "2026-01-19T00:00:00.000Z",
    rating: 6.2,
    text: "С парковкой возникли сложности: мест мало, навигация на въезде непонятная.",
    stayTypeRaw: "Transit"
  }),
  makeReview({
    id: "review-cr-005",
    hotelId: "hotel-courtyard-rostov",
    source: "yandex",
    reviewDate: "2026-01-22T00:00:00.000Z",
    rating: 9.4,
    text: "Чисто, тихо, матрас удобный. Качество сна отличное, утром успел на ранний завтрак.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-006",
    hotelId: "hotel-courtyard-rostov",
    source: "ostrovok",
    reviewDate: "2026-01-24T00:00:00.000Z",
    rating: 8.9,
    text: "Приехали вдвоем на выходные. Уютно, ресторан достойный, атмосфера приятная.",
    stayTypeRaw: "Couple"
  }),
  makeReview({
    id: "review-cr-007",
    hotelId: "hotel-courtyard-rostov",
    source: "yandex",
    reviewDate: "2026-01-28T00:00:00.000Z",
    rating: 5.8,
    text: "В номере было пыльно, кондиционер не работал. Проблему решили только утром.",
    stayTypeRaw: "Solo"
  }),
  makeReview({
    id: "review-cr-008",
    hotelId: "hotel-courtyard-rostov",
    source: "2gis",
    reviewDate: "2026-02-03T00:00:00.000Z",
    rating: 8.8,
    text: "Приезжал на форум. Удобное расположение, хороший интернет, персонал быстро помог с документами.",
    stayTypeRaw: "Event"
  }),
  makeReview({
    id: "review-cr-009",
    hotelId: "hotel-courtyard-rostov",
    source: "booking.com",
    sourceReviewId: "bk-009",
    reviewDate: "2026-02-07T00:00:00.000Z",
    rating: 7.3,
    text: "На одну ночь по дороге. Заезд удобный, но ночью было шумно из коридора.",
    stayTypeRaw: "Transit"
  }),
  makeReview({
    id: "review-cr-010",
    hotelId: "hotel-courtyard-rostov",
    source: "manual_upload",
    reviewDate: "2026-02-12T00:00:00.000Z",
    rating: 8.3,
    text: "Сервис хороший, но на завтраке не хватало горячих блюд в пиковый час.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-011",
    hotelId: "hotel-courtyard-rostov",
    source: "yandex",
    reviewDate: "2026-02-16T00:00:00.000Z",
    rating: 9.1,
    text: "Очень вежливый персонал и быстрый check-out. По соотношению цена/качество все отлично.",
    stayTypeRaw: "Business"
  }),
  makeReview({
    id: "review-cr-012",
    hotelId: "hotel-courtyard-rostov",
    source: "ostrovok",
    reviewDate: "2026-02-20T00:00:00.000Z",
    rating: 8.5,
    text: "Путешествовал один. Номер чистый, Wi-Fi быстрый, но вечером в ресторане обслуживание было медленным.",
    stayTypeRaw: "Solo"
  })
];
