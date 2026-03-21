import { Hotel } from "@/entities/types";

const now = new Date().toISOString();

export const seedHotels: Hotel[] = [
  {
    id: "hotel-courtyard-rostov",
    name: "Courtyard by Marriott Ростов-на-Дону",
    brand: "Courtyard by Marriott",
    city: "Ростов-на-Дону",
    country: "Россия",
    category: "4*",
    address: "ул. Большая Садовая, 115, Ростов-на-Дону",
    coordinates: {
      lat: 47.2221,
      lon: 39.7188
    },
    description:
      "Бизнес-ориентированный городской отель с инфраструктурой для командировок и мероприятий.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "hotel-riverpark-kazan",
    name: "Riverpark Hotel Kazan",
    brand: "Riverpark",
    city: "Казань",
    country: "Россия",
    category: "4*",
    address: "Набережная, 21, Казань",
    coordinates: {
      lat: 55.7961,
      lon: 49.1064
    },
    description:
      "Городской отель смешанного спроса: бизнес, семейные поездки и событийный трафик.",
    createdAt: now,
    updatedAt: now
  }
];
