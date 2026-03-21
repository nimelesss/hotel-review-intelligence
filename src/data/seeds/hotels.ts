import { Hotel } from "@/entities/types";

const now = new Date().toISOString();

export const seedHotels: Hotel[] = [
  {
    id: "hotel-courtyard-rostov",
    name: "Courtyard by Marriott Rostov-on-Don",
    brand: "Courtyard by Marriott",
    city: "Ростов-на-Дону",
    country: "Россия",
    category: "4*",
    address: "Ростов-на-Дону, Россия (адрес уточняется)",
    coordinates: {
      lat: 47.2221,
      lon: 39.7188
    },
    description:
      "Городской отель, ориентированный на деловых гостей и событийный спрос.",
    createdAt: now,
    updatedAt: now
  }
];
