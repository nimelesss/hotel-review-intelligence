import { NextResponse } from "next/server";

/**
 * Health check endpoint для мониторинга и CI/CD
 */
export async function GET() {
  try {
    const { getRepository } = await import("@/server/repositories");
    
    const repository = getRepository();
    const hotels = repository.listHotels();
    
    // Проверка что есть отели в базе
    if (hotels.length === 0) {
      return NextResponse.json(
        {
          status: "degraded",
          message: "Database is empty - no hotels found",
          timestamp: new Date().toISOString()
        },
        { status: 503 }
      );
    }
    
    // Проверка что есть отзывы
    const hotelsWithReviews = hotels.filter(h => (h.reviewCount ?? 0) > 0);
    if (hotelsWithReviews.length === 0) {
      return NextResponse.json(
        {
          status: "degraded", 
          message: "No reviews in database",
          timestamp: new Date().toISOString()
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      stats: {
        totalHotels: hotels.length,
        hotelsWithReviews: hotelsWithReviews.length
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}
