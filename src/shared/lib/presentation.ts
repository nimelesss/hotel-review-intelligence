import { RecommendationPriority, SentimentLabel } from "@/entities/types";

export function sentimentVariant(
  sentiment: SentimentLabel
): "success" | "warning" | "danger" {
  if (sentiment === "positive") {
    return "success";
  }
  if (sentiment === "negative") {
    return "danger";
  }
  return "warning";
}

export function priorityVariant(
  priority: RecommendationPriority
): "danger" | "warning" | "info" {
  if (priority === "high") {
    return "danger";
  }
  if (priority === "medium") {
    return "warning";
  }
  return "info";
}

export function riskVariant(
  level: "low" | "medium" | "high"
): "success" | "warning" | "danger" {
  if (level === "high") {
    return "danger";
  }
  if (level === "medium") {
    return "warning";
  }
  return "success";
}
