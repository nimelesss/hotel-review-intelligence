import { NextResponse } from "next/server";
import { ReviewSource, SegmentId, SentimentLabel, TopicId } from "@/entities/types";
import { getRepository } from "@/server/repositories";
import { resolveHotelId } from "@/server/services/intelligence.service";

export async function GET(request: Request) {
  const repository = getRepository();
  const { searchParams } = new URL(request.url);
  const hotelId = resolveHotelId(searchParams.get("hotelId") ?? undefined);

  const result = repository.queryReviews({
    hotelId,
    sentiment: castSentiment(searchParams.get("sentiment")),
    segment: castSegment(searchParams.get("segment")),
    topic: castTopic(searchParams.get("topic")),
    source: castSource(searchParams.get("source")),
    ratingMin: castNumber(searchParams.get("ratingMin")),
    ratingMax: castNumber(searchParams.get("ratingMax")),
    dateFrom: castString(searchParams.get("dateFrom")),
    dateTo: castString(searchParams.get("dateTo")),
    search: castString(searchParams.get("search"))
  });

  return NextResponse.json(result);
}

function castSentiment(value: string | null): SentimentLabel | undefined {
  if (!value) {
    return undefined;
  }
  return ["positive", "neutral", "negative"].includes(value)
    ? (value as SentimentLabel)
    : undefined;
}

function castSegment(value: string | null): SegmentId | undefined {
  if (!value) {
    return undefined;
  }
  return [
    "business_traveler",
    "family",
    "couple",
    "transit_guest",
    "event_guest",
    "solo_traveler",
    "mixed",
    "unclassified"
  ].includes(value)
    ? (value as SegmentId)
    : undefined;
}

function castTopic(value: string | null): TopicId | undefined {
  if (!value) {
    return undefined;
  }
  return [
    "cleanliness",
    "service",
    "location",
    "breakfast",
    "wifi",
    "parking",
    "silence",
    "room",
    "checkin_checkout",
    "restaurant_food",
    "value_for_money",
    "business_infrastructure",
    "sleep_comfort",
    "staff"
  ].includes(value)
    ? (value as TopicId)
    : undefined;
}

function castNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function castSource(value: string | null): ReviewSource | undefined {
  if (!value) {
    return undefined;
  }
  return [
    "booking.com",
    "yandex",
    "2gis",
    "flamp",
    "ostrovok",
    "otzovik",
    "yell",
    "sutochno",
    "bronevik",
    "tripadvisor",
    "manual_upload",
    "mock_api",
    "apify_dataset"
  ].includes(value)
    ? (value as ReviewSource)
    : undefined;
}

function castString(value: string | null): string | undefined {
  return value ? value : undefined;
}
