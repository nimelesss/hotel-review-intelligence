export type LocaleCode = "ru" | "en";

export const defaultLocale: LocaleCode = "ru";

export const dictionary = {
  ru: {
    dashboard: "Dashboard",
    reviews: "Review Explorer",
    segments: "Segment Analysis",
    recommendations: "Recommendations",
    methodology: "Methodology",
    upload: "Data Upload"
  },
  en: {
    dashboard: "Dashboard",
    reviews: "Review Explorer",
    segments: "Segment Analysis",
    recommendations: "Recommendations",
    methodology: "Methodology",
    upload: "Data Upload"
  }
} as const;
