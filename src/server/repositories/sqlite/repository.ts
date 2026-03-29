import {
  AnalysisRun,
  CreateHotelRequest,
  Hotel,
  HotelAggregate,
  HotelExternalProfile,
  Recommendation,
  Review,
  ReviewAnalysis,
  ReviewFetchJob,
  ReviewFetchJobSource,
  ReviewsQuery,
  ReviewsQueryResult,
  SegmentId
} from "@/entities/types";
import { getSqliteDb } from "@/server/db/sqlite/client";
import {
  IntelligenceRepository,
  RepositorySnapshot
} from "@/server/repositories/types";
import { normalizeSearchText, normalizeWhitespace } from "@/shared/lib/text";

export class SqliteIntelligenceRepository implements IntelligenceRepository {
  private readonly db = getSqliteDb();

  listHotels(): Hotel[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            external_id,
            name,
            brand,
            city,
            country,
            category,
            address,
            coordinates_lat,
            coordinates_lon,
            description,
            review_count,
            latest_review_date,
            created_at,
            updated_at
          FROM hotel_catalog.hotels
          ORDER BY review_count DESC, updated_at DESC
        `
      )
      .all() as DbHotelRow[];
    return rows.map(mapHotelRow);
  }

  createHotel(request: CreateHotelRequest): Hotel {
    const normalizedName = request.name.trim();
    const normalizedCity = request.city.trim();
    if (!normalizedName || !normalizedCity) {
      throw new Error("Название отеля и город обязательны.");
    }

    const externalId = request.externalId?.trim();
    if (externalId) {
      const existingByExternal = this.db
        .prepare(
          `
            SELECT
              id,
              external_id,
              name,
              brand,
              city,
              country,
              category,
              address,
              coordinates_lat,
              coordinates_lon,
              description,
              review_count,
              latest_review_date,
              created_at,
              updated_at
            FROM hotel_catalog.hotels
            WHERE external_id = ?
            LIMIT 1
          `
        )
        .get(externalId) as DbHotelRow | undefined;
      if (existingByExternal) {
        const merged = mergeHotel(mapHotelRow(existingByExternal), request);
        this.upsertHotel(merged);
        return merged;
      }
    }

    const existingByNameCity = this.db
      .prepare(
        `
          SELECT
            id,
            external_id,
            name,
            brand,
            city,
            country,
            category,
            address,
            coordinates_lat,
            coordinates_lon,
            description,
            review_count,
            latest_review_date,
            created_at,
            updated_at
          FROM hotel_catalog.hotels
          WHERE normalized_name = ?
            AND normalized_city = ?
          LIMIT 1
        `
      )
      .get(
        canonicalHotelName(normalizedName, normalizedCity),
        normalizeSearchText(normalizedCity)
      ) as DbHotelRow | undefined;

    if (existingByNameCity) {
      const merged = mergeHotel(mapHotelRow(existingByNameCity), request);
      this.upsertHotel(merged);
      return merged;
    }

    const now = new Date().toISOString();
    const hotel: Hotel = {
      id: `hotel-${slugify(normalizedName)}-${slugify(normalizedCity)}-${Date.now()
        .toString()
        .slice(-5)}`,
      name: normalizedName,
      city: normalizedCity,
      country: (request.country || "Россия").trim(),
      brand: (request.brand || "Независимый отель").trim(),
      category: (request.category || "4*").trim(),
      address: (request.address || `${normalizedCity}, ${request.country || "Россия"}`).trim(),
      description:
        (request.description ||
          "Профиль создан пользователем. Аналитика появится после загрузки отзывов.").trim(),
      coordinates: request.coordinates,
      externalId,
      createdAt: now,
      updatedAt: now
    };
    this.upsertHotel(hotel);
    return hotel;
  }

  getHotelById(hotelId: string): Hotel | undefined {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            external_id,
            name,
            brand,
            city,
            country,
            category,
            address,
            coordinates_lat,
            coordinates_lon,
            description,
            review_count,
            latest_review_date,
            created_at,
            updated_at
          FROM hotel_catalog.hotels
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(hotelId) as DbHotelRow | undefined;
    return row ? mapHotelRow(row) : undefined;
  }

  listReviewsByHotel(hotelId: string): Review[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            hotel_id,
            source,
            source_review_id,
            review_date,
            rating,
            title,
            text,
            cleaned_text,
            language,
            author_name,
            stay_type_raw,
            created_at,
            updated_at
          FROM reviews
          WHERE hotel_id = ?
          ORDER BY review_date DESC
        `
      )
      .all(hotelId) as DbReviewRow[];
    return rows.map(mapReviewRow);
  }

  listAnalysesByHotel(hotelId: string): ReviewAnalysis[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            review_id,
            sentiment_label,
            sentiment_score,
            topics,
            keywords,
            segment_scores,
            primary_segment,
            confidence,
            explanation,
            manager_impact,
            risk_flags,
            analyzed_at,
            analysis_version
          FROM review_analyses
          WHERE hotel_id = ?
        `
      )
      .all(hotelId) as DbAnalysisRow[];
    return rows.map(mapAnalysisRow);
  }

  getAggregateByHotel(hotelId: string): HotelAggregate | undefined {
    const row = this.db
      .prepare(`SELECT payload FROM hotel_aggregates WHERE hotel_id = ? LIMIT 1`)
      .get(hotelId) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as HotelAggregate) : undefined;
  }

  listRecommendationsByHotel(hotelId: string): Recommendation[] {
    const rows = this.db
      .prepare(`SELECT payload FROM recommendations WHERE hotel_id = ? ORDER BY created_at DESC`)
      .all(hotelId) as Array<{ payload: string }>;
    return rows.map((row) => JSON.parse(row.payload) as Recommendation);
  }

  listRunsByHotel(hotelId: string): AnalysisRun[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            hotel_id,
            source_type,
            total_reviews_processed,
            status,
            started_at,
            completed_at,
            analysis_version,
            notes,
            progress_pct,
            stage,
            error_message,
            fetched_reviews,
            provider
          FROM analysis_runs
          WHERE hotel_id = ?
          ORDER BY started_at DESC
        `
      )
      .all(hotelId) as DbRunRow[];
    return rows.map(mapRunRow);
  }

  queryReviews(query: ReviewsQuery): ReviewsQueryResult {
    const rows = this.db
      .prepare(
        `
          SELECT
            r.id AS review_id,
            r.hotel_id AS review_hotel_id,
            r.source AS review_source,
            r.source_review_id AS review_source_review_id,
            r.review_date AS review_date,
            r.rating AS review_rating,
            r.title AS review_title,
            r.text AS review_text,
            r.cleaned_text AS review_cleaned_text,
            r.language AS review_language,
            r.author_name AS review_author_name,
            r.stay_type_raw AS review_stay_type_raw,
            r.created_at AS review_created_at,
            r.updated_at AS review_updated_at,
            a.id AS analysis_id,
            a.review_id AS analysis_review_id,
            a.sentiment_label AS analysis_sentiment_label,
            a.sentiment_score AS analysis_sentiment_score,
            a.topics AS analysis_topics,
            a.keywords AS analysis_keywords,
            a.segment_scores AS analysis_segment_scores,
            a.primary_segment AS analysis_primary_segment,
            a.confidence AS analysis_confidence,
            a.explanation AS analysis_explanation,
            a.manager_impact AS analysis_manager_impact,
            a.risk_flags AS analysis_risk_flags,
            a.analyzed_at AS analysis_analyzed_at,
            a.analysis_version AS analysis_version
          FROM reviews r
          INNER JOIN review_analyses a ON a.review_id = r.id
          WHERE r.hotel_id = ?
        `
      )
      .all(query.hotelId) as DbReviewWithAnalysisRow[];

    const joined = rows.map((row) => ({
      review: mapReviewWithAnalysisRowToReview(row),
      analysis: mapReviewWithAnalysisRowToAnalysis(row)
    }));
    const filtered = joined.filter((item) =>
      applyReviewFilters(item.review, item.analysis, query)
    );

    return {
      total: filtered.length,
      items: filtered.sort((a, b) => b.review.reviewDate.localeCompare(a.review.reviewDate))
    };
  }

  createRun(run: AnalysisRun): void {
    this.db
      .prepare(
        `
          INSERT INTO analysis_runs (
            id,
            hotel_id,
            source_type,
            total_reviews_processed,
            status,
            started_at,
            completed_at,
            analysis_version,
            notes,
            progress_pct,
            stage,
            error_message,
            fetched_reviews,
            provider
          ) VALUES (
            @id, @hotel_id, @source_type, @total_reviews_processed, @status, @started_at,
            @completed_at, @analysis_version, @notes, @progress_pct, @stage,
            @error_message, @fetched_reviews, @provider
          )
          ON CONFLICT(id) DO UPDATE SET
            hotel_id = excluded.hotel_id,
            source_type = excluded.source_type,
            total_reviews_processed = excluded.total_reviews_processed,
            status = excluded.status,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at,
            analysis_version = excluded.analysis_version,
            notes = excluded.notes,
            progress_pct = excluded.progress_pct,
            stage = excluded.stage,
            error_message = excluded.error_message,
            fetched_reviews = excluded.fetched_reviews,
            provider = excluded.provider
        `
      )
      .run(runToSqliteRow(run));
  }

  updateRun(runId: string, patch: Partial<AnalysisRun>): AnalysisRun | undefined {
    const current = this.getRunById(runId);
    if (!current) {
      return undefined;
    }
    const merged: AnalysisRun = {
      ...current,
      ...patch
    };
    this.createRun(merged);
    return merged;
  }

  getRunById(runId: string): AnalysisRun | undefined {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            hotel_id,
            source_type,
            total_reviews_processed,
            status,
            started_at,
            completed_at,
            analysis_version,
            notes,
            progress_pct,
            stage,
            error_message,
            fetched_reviews,
            provider
          FROM analysis_runs
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(runId) as DbRunRow | undefined;
    return row ? mapRunRow(row) : undefined;
  }

  listExternalProfilesByHotel(hotelId: string): HotelExternalProfile[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            hotel_id,
            source,
            external_id,
            external_uri,
            external_url,
            external_name,
            external_address,
            latitude,
            longitude,
            rating,
            reviews_count,
            match_confidence,
            is_active,
            last_verified_at,
            created_at,
            updated_at
          FROM hotel_catalog.external_profiles
          WHERE hotel_id = ?
          ORDER BY updated_at DESC
        `
      )
      .all(hotelId) as DbExternalProfileRow[];
    return rows.map(mapExternalProfileRow);
  }

  upsertExternalProfile(profile: HotelExternalProfile): void {
    this.db
      .prepare(
        `
          INSERT INTO hotel_catalog.external_profiles (
            id,
            hotel_id,
            source,
            external_id,
            external_uri,
            external_url,
            external_name,
            external_address,
            latitude,
            longitude,
            rating,
            reviews_count,
            match_confidence,
            is_active,
            last_verified_at,
            created_at,
            updated_at
          ) VALUES (
            @id, @hotel_id, @source, @external_id, @external_uri, @external_url, @external_name,
            @external_address, @latitude, @longitude, @rating, @reviews_count, @match_confidence,
            @is_active, @last_verified_at, @created_at, @updated_at
          )
          ON CONFLICT(hotel_id, source) DO UPDATE SET
            external_id = excluded.external_id,
            external_uri = excluded.external_uri,
            external_url = excluded.external_url,
            external_name = excluded.external_name,
            external_address = excluded.external_address,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            rating = excluded.rating,
            reviews_count = excluded.reviews_count,
            match_confidence = excluded.match_confidence,
            is_active = excluded.is_active,
            last_verified_at = excluded.last_verified_at,
            updated_at = excluded.updated_at
        `
      )
      .run(externalProfileToSqliteRow(profile));
  }

  createReviewFetchJob(job: ReviewFetchJob): void {
    this.db
      .prepare(
        `
          INSERT INTO review_fetch_jobs (
            id,
            hotel_id,
            trigger_type,
            from_date,
            to_date,
            status,
            progress_pct,
            current_stage,
            total_collected,
            warning_count,
            error_message,
            started_at,
            completed_at,
            created_at,
            updated_at
          ) VALUES (
            @id, @hotel_id, @trigger_type, @from_date, @to_date, @status, @progress_pct, @current_stage,
            @total_collected, @warning_count, @error_message, @started_at, @completed_at, @created_at, @updated_at
          )
          ON CONFLICT(id) DO UPDATE SET
            hotel_id = excluded.hotel_id,
            trigger_type = excluded.trigger_type,
            from_date = excluded.from_date,
            to_date = excluded.to_date,
            status = excluded.status,
            progress_pct = excluded.progress_pct,
            current_stage = excluded.current_stage,
            total_collected = excluded.total_collected,
            warning_count = excluded.warning_count,
            error_message = excluded.error_message,
            started_at = excluded.started_at,
            completed_at = excluded.completed_at,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at
        `
      )
      .run(reviewFetchJobToSqliteRow(job));
  }

  updateReviewFetchJob(
    jobId: string,
    patch: Partial<ReviewFetchJob>
  ): ReviewFetchJob | undefined {
    const current = this.getReviewFetchJobById(jobId);
    if (!current) {
      return undefined;
    }
    const merged: ReviewFetchJob = {
      ...current,
      ...patch,
      updatedAt: patch.updatedAt || new Date().toISOString()
    };
    this.createReviewFetchJob(merged);
    return merged;
  }

  getReviewFetchJobById(jobId: string): ReviewFetchJob | undefined {
    const row = this.db
      .prepare(
        `
          SELECT
            id,
            hotel_id,
            trigger_type,
            from_date,
            to_date,
            status,
            progress_pct,
            current_stage,
            total_collected,
            warning_count,
            error_message,
            started_at,
            completed_at,
            created_at,
            updated_at
          FROM review_fetch_jobs
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(jobId) as DbReviewFetchJobRow | undefined;
    return row ? mapReviewFetchJobRow(row) : undefined;
  }

  listReviewFetchJobsByHotel(hotelId: string, limit = 20): ReviewFetchJob[] {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            hotel_id,
            trigger_type,
            from_date,
            to_date,
            status,
            progress_pct,
            current_stage,
            total_collected,
            warning_count,
            error_message,
            started_at,
            completed_at,
            created_at,
            updated_at
          FROM review_fetch_jobs
          WHERE hotel_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `
      )
      .all(hotelId, safeLimit) as DbReviewFetchJobRow[];
    return rows.map(mapReviewFetchJobRow);
  }

  createReviewFetchJobSource(source: ReviewFetchJobSource): void {
    this.db
      .prepare(
        `
          INSERT INTO review_fetch_job_sources (
            id,
            job_id,
            source,
            status,
            collected_count,
            notes,
            error_message,
            started_at,
            completed_at,
            updated_at
          ) VALUES (
            @id, @job_id, @source, @status, @collected_count, @notes, @error_message,
            @started_at, @completed_at, @updated_at
          )
          ON CONFLICT(job_id, source) DO UPDATE SET
            status = excluded.status,
            collected_count = excluded.collected_count,
            notes = excluded.notes,
            error_message = excluded.error_message,
            started_at = COALESCE(excluded.started_at, review_fetch_job_sources.started_at),
            completed_at = excluded.completed_at,
            updated_at = excluded.updated_at
        `
      )
      .run(reviewFetchJobSourceToSqliteRow(source));
  }

  updateReviewFetchJobSource(
    sourceId: string,
    patch: Partial<ReviewFetchJobSource>
  ): ReviewFetchJobSource | undefined {
    const currentRow = this.db
      .prepare(
        `
          SELECT
            id,
            job_id,
            source,
            status,
            collected_count,
            notes,
            error_message,
            started_at,
            completed_at,
            updated_at
          FROM review_fetch_job_sources
          WHERE id = ?
          LIMIT 1
        `
      )
      .get(sourceId) as DbReviewFetchJobSourceRow | undefined;
    if (!currentRow) {
      return undefined;
    }

    const merged: ReviewFetchJobSource = {
      ...mapReviewFetchJobSourceRow(currentRow),
      ...patch,
      updatedAt: patch.updatedAt || new Date().toISOString()
    };
    this.createReviewFetchJobSource(merged);
    return merged;
  }

  listReviewFetchJobSources(jobId: string): ReviewFetchJobSource[] {
    const rows = this.db
      .prepare(
        `
          SELECT
            id,
            job_id,
            source,
            status,
            collected_count,
            notes,
            error_message,
            started_at,
            completed_at,
            updated_at
          FROM review_fetch_job_sources
          WHERE job_id = ?
          ORDER BY updated_at DESC
        `
      )
      .all(jobId) as DbReviewFetchJobSourceRow[];
    return rows.map(mapReviewFetchJobSourceRow);
  }

  upsertAnalytics(
    hotelId: string,
    reviews: Review[],
    analyses: ReviewAnalysis[],
    aggregate: HotelAggregate,
    recommendations: Recommendation[],
    run: AnalysisRun
  ): void {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM review_analyses WHERE hotel_id = ?`).run(hotelId);
      this.db.prepare(`DELETE FROM recommendations WHERE hotel_id = ?`).run(hotelId);
      this.db.prepare(`DELETE FROM hotel_aggregates WHERE hotel_id = ?`).run(hotelId);
      this.db.prepare(`DELETE FROM reviews WHERE hotel_id = ?`).run(hotelId);

      const insertReview = this.db.prepare(
        `
          INSERT INTO reviews (
            id, hotel_id, source, source_review_id, review_date, rating, title, text,
            cleaned_text, language, author_name, stay_type_raw, text_hash, created_at, updated_at
          ) VALUES (
            @id, @hotel_id, @source, @source_review_id, @review_date, @rating, @title, @text,
            @cleaned_text, @language, @author_name, @stay_type_raw, @text_hash, @created_at, @updated_at
          )
        `
      );
      reviews.forEach((review) => {
        insertReview.run({
          id: review.id,
          hotel_id: review.hotelId,
          source: review.source,
          source_review_id: review.sourceReviewId || null,
          review_date: review.reviewDate,
          rating: review.rating,
          title: review.title || null,
          text: review.text,
          cleaned_text: review.cleanedText,
          language: review.language,
          author_name: review.authorName || null,
          stay_type_raw: review.stayTypeRaw || null,
          text_hash: makeTextHash(review.text),
          created_at: review.createdAt,
          updated_at: review.updatedAt
        });
      });

      const insertAnalysis = this.db.prepare(
        `
          INSERT INTO review_analyses (
            id, review_id, hotel_id, sentiment_label, sentiment_score, primary_segment, confidence,
            topics, keywords, segment_scores, explanation, manager_impact, risk_flags, analyzed_at, analysis_version
          ) VALUES (
            @id, @review_id, @hotel_id, @sentiment_label, @sentiment_score, @primary_segment, @confidence,
            @topics, @keywords, @segment_scores, @explanation, @manager_impact, @risk_flags, @analyzed_at, @analysis_version
          )
        `
      );
      analyses.forEach((analysis) => {
        insertAnalysis.run({
          id: analysis.id,
          review_id: analysis.reviewId,
          hotel_id: hotelId,
          sentiment_label: analysis.sentimentLabel,
          sentiment_score: analysis.sentimentScore,
          primary_segment: analysis.primarySegment,
          confidence: analysis.confidence,
          topics: JSON.stringify(analysis.topics),
          keywords: JSON.stringify(analysis.keywords),
          segment_scores: JSON.stringify(analysis.segmentScores),
          explanation: JSON.stringify(analysis.explanation),
          manager_impact: JSON.stringify(analysis.managerImpact),
          risk_flags: JSON.stringify(analysis.riskFlags),
          analyzed_at: analysis.analyzedAt,
          analysis_version: analysis.analysisVersion
        });
      });

      this.db
        .prepare(
          `
            INSERT INTO hotel_aggregates (hotel_id, payload, updated_at)
            VALUES (?, ?, ?)
          `
        )
        .run(hotelId, JSON.stringify(aggregate), aggregate.updatedAt);

      const insertRecommendation = this.db.prepare(
        `
          INSERT INTO recommendations (
            id, hotel_id, category, priority, payload, created_at, updated_at
          ) VALUES (
            @id, @hotel_id, @category, @priority, @payload, @created_at, @updated_at
          )
        `
      );
      recommendations.forEach((recommendation) => {
        insertRecommendation.run({
          id: recommendation.id,
          hotel_id: hotelId,
          category: recommendation.category,
          priority: recommendation.priority,
          payload: JSON.stringify(recommendation),
          created_at: recommendation.createdAt,
          updated_at: recommendation.updatedAt
        });
      });

      this.createRun(run);

      const latestReviewDate = reviews
        .map((review) => review.reviewDate)
        .sort((a, b) => b.localeCompare(a))[0];
      this.db
        .prepare(
          `
            UPDATE hotel_catalog.hotels
            SET review_count = ?, latest_review_date = ?, updated_at = ?
            WHERE id = ?
          `
        )
        .run(reviews.length, latestReviewDate || null, new Date().toISOString(), hotelId);
    });
    tx();
  }

  getSnapshot(): RepositorySnapshot {
    const hotels = this.listHotels();
    const reviews = (this.db.prepare(`SELECT * FROM reviews`).all() as DbReviewRow[]).map(
      mapReviewRow
    );
    const analyses = (
      this.db.prepare(`SELECT * FROM review_analyses`).all() as DbAnalysisRow[]
    ).map(mapAnalysisRow);
    const aggregates = (
      this.db.prepare(`SELECT payload FROM hotel_aggregates`).all() as Array<{ payload: string }>
    ).map((row) => JSON.parse(row.payload) as HotelAggregate);
    const recommendations = (
      this.db.prepare(`SELECT payload FROM recommendations`).all() as Array<{ payload: string }>
    ).map((row) => JSON.parse(row.payload) as Recommendation);
    const runs = (this.db.prepare(`SELECT * FROM analysis_runs`).all() as DbRunRow[]).map(mapRunRow);
    const externalProfiles = (
      this.db
        .prepare(
          `
            SELECT
              id,
              hotel_id,
              source,
              external_id,
              external_uri,
              external_url,
              external_name,
              external_address,
              latitude,
              longitude,
              rating,
              reviews_count,
              match_confidence,
              is_active,
              last_verified_at,
              created_at,
              updated_at
            FROM hotel_catalog.external_profiles
          `
        )
        .all() as DbExternalProfileRow[]
    ).map(mapExternalProfileRow);
    const reviewFetchJobs = (
      this.db.prepare(`SELECT * FROM review_fetch_jobs`).all() as DbReviewFetchJobRow[]
    ).map(mapReviewFetchJobRow);
    const reviewFetchJobSources = (
      this.db
        .prepare(`SELECT * FROM review_fetch_job_sources`)
        .all() as DbReviewFetchJobSourceRow[]
    ).map(mapReviewFetchJobSourceRow);

    return {
      hotels,
      reviews,
      analyses,
      aggregates,
      recommendations,
      runs,
      externalProfiles,
      reviewFetchJobs,
      reviewFetchJobSources
    };
  }

  private upsertHotel(hotel: Hotel) {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
          INSERT INTO hotel_catalog.hotels (
            id, external_id, name, normalized_name, brand, city, normalized_city, country,
            category, address, coordinates_lat, coordinates_lon, aliases, description,
            review_count, latest_review_date, created_at, updated_at
          ) VALUES (
            @id, @external_id, @name, @normalized_name, @brand, @city, @normalized_city, @country,
            @category, @address, @coordinates_lat, @coordinates_lon, @aliases, @description,
            COALESCE(@review_count, 0), @latest_review_date, @created_at, @updated_at
          )
          ON CONFLICT(id) DO UPDATE SET
            external_id = excluded.external_id,
            name = excluded.name,
            normalized_name = excluded.normalized_name,
            brand = excluded.brand,
            city = excluded.city,
            normalized_city = excluded.normalized_city,
            country = excluded.country,
            category = excluded.category,
            address = excluded.address,
            coordinates_lat = excluded.coordinates_lat,
            coordinates_lon = excluded.coordinates_lon,
            description = excluded.description,
            review_count = COALESCE(excluded.review_count, hotel_catalog.hotels.review_count),
            latest_review_date = COALESCE(excluded.latest_review_date, hotel_catalog.hotels.latest_review_date),
            updated_at = excluded.updated_at
        `
      )
      .run({
        id: hotel.id,
        external_id: hotel.externalId || null,
        name: hotel.name,
        normalized_name: canonicalHotelName(hotel.name, hotel.city),
        brand: hotel.brand,
        city: hotel.city,
        normalized_city: normalizeSearchText(hotel.city),
        country: hotel.country,
        category: hotel.category,
        address: hotel.address,
        coordinates_lat: hotel.coordinates?.lat ?? null,
        coordinates_lon: hotel.coordinates?.lon ?? null,
        aliases: JSON.stringify([]),
        description: hotel.description,
        review_count: hotel.reviewCount ?? 0,
        latest_review_date: hotel.latestReviewDate || null,
        created_at: hotel.createdAt || now,
        updated_at: hotel.updatedAt || now
      });
  }
}

interface DbHotelRow {
  id: string;
  external_id: string | null;
  name: string;
  brand: string;
  city: string;
  country: string;
  category: string;
  address: string;
  coordinates_lat: number | null;
  coordinates_lon: number | null;
  description: string;
  review_count: number;
  latest_review_date: string | null;
  created_at: string;
  updated_at: string;
}

interface DbReviewRow {
  id: string;
  hotel_id: string;
  source: string;
  source_review_id: string | null;
  review_date: string;
  rating: number;
  title: string | null;
  text: string;
  cleaned_text: string;
  language: string;
  author_name: string | null;
  stay_type_raw: string | null;
  created_at: string;
  updated_at: string;
}

interface DbAnalysisRow {
  id: string;
  review_id: string;
  sentiment_label: string;
  sentiment_score: number;
  topics: string;
  keywords: string;
  segment_scores: string;
  primary_segment: string;
  confidence: number;
  explanation: string;
  manager_impact: string;
  risk_flags: string;
  analyzed_at: string;
  analysis_version: string;
}

interface DbRunRow {
  id: string;
  hotel_id: string;
  source_type: string;
  total_reviews_processed: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  analysis_version: string;
  notes: string | null;
  progress_pct: number | null;
  stage: string | null;
  error_message: string | null;
  fetched_reviews: number | null;
  provider: string | null;
}

interface DbExternalProfileRow {
  id: string;
  hotel_id: string;
  source: string;
  external_id: string | null;
  external_uri: string | null;
  external_url: string | null;
  external_name: string | null;
  external_address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviews_count: number | null;
  match_confidence: number | null;
  is_active: number;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbReviewFetchJobRow {
  id: string;
  hotel_id: string;
  trigger_type: string;
  from_date: string | null;
  to_date: string | null;
  status: string;
  progress_pct: number;
  current_stage: string;
  total_collected: number;
  warning_count: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbReviewFetchJobSourceRow {
  id: string;
  job_id: string;
  source: string;
  status: string;
  collected_count: number;
  notes: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
}

interface DbReviewWithAnalysisRow {
  review_id: string;
  review_hotel_id: string;
  review_source: string;
  review_source_review_id: string | null;
  review_date: string;
  review_rating: number;
  review_title: string | null;
  review_text: string;
  review_cleaned_text: string;
  review_language: string;
  review_author_name: string | null;
  review_stay_type_raw: string | null;
  review_created_at: string;
  review_updated_at: string;
  analysis_id: string;
  analysis_review_id: string;
  analysis_sentiment_label: string;
  analysis_sentiment_score: number;
  analysis_topics: string;
  analysis_keywords: string;
  analysis_segment_scores: string;
  analysis_primary_segment: string;
  analysis_confidence: number;
  analysis_explanation: string;
  analysis_manager_impact: string;
  analysis_risk_flags: string;
  analysis_analyzed_at: string;
  analysis_version: string;
}

function mapHotelRow(row: DbHotelRow): Hotel {
  return {
    id: row.id,
    externalId: row.external_id || undefined,
    name: row.name,
    brand: row.brand,
    city: row.city,
    country: row.country,
    category: row.category,
    address: row.address,
    coordinates:
      typeof row.coordinates_lat === "number" && typeof row.coordinates_lon === "number"
        ? { lat: row.coordinates_lat, lon: row.coordinates_lon }
        : undefined,
    description: row.description,
    reviewCount: Number(row.review_count || 0),
    latestReviewDate: row.latest_review_date || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReviewRow(row: DbReviewRow): Review {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    source: row.source as Review["source"],
    sourceReviewId: row.source_review_id || undefined,
    reviewDate: row.review_date,
    rating: Number(row.rating),
    title: row.title || undefined,
    text: row.text,
    cleanedText: row.cleaned_text,
    language: row.language,
    authorName: row.author_name || undefined,
    stayTypeRaw: row.stay_type_raw || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAnalysisRow(row: DbAnalysisRow): ReviewAnalysis {
  return {
    id: row.id,
    reviewId: row.review_id,
    sentimentLabel: row.sentiment_label as ReviewAnalysis["sentimentLabel"],
    sentimentScore: Number(row.sentiment_score),
    topics: safeParseJson(row.topics, []),
    keywords: safeParseJson(row.keywords, []),
    segmentScores: safeParseJson(row.segment_scores, emptySegmentScores()),
    primarySegment: row.primary_segment as ReviewAnalysis["primarySegment"],
    confidence: Number(row.confidence),
    explanation: safeParseJson(row.explanation, []),
    managerImpact: safeParseJson(row.manager_impact, {
      summary: "",
      operationalSignal: "",
      marketingSignal: ""
    }),
    riskFlags: safeParseJson(row.risk_flags, []),
    analyzedAt: row.analyzed_at,
    analysisVersion: row.analysis_version
  };
}

function mapRunRow(row: DbRunRow): AnalysisRun {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    sourceType: row.source_type as AnalysisRun["sourceType"],
    totalReviewsProcessed: Number(row.total_reviews_processed || 0),
    status: row.status as AnalysisRun["status"],
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
    analysisVersion: row.analysis_version,
    notes: row.notes || undefined,
    progressPct: typeof row.progress_pct === "number" ? Number(row.progress_pct) : undefined,
    stage: row.stage || undefined,
    errorMessage: row.error_message || undefined,
    fetchedReviews:
      typeof row.fetched_reviews === "number" ? Number(row.fetched_reviews) : undefined,
    provider: row.provider ? (row.provider as AnalysisRun["provider"]) : undefined
  };
}

function mapExternalProfileRow(row: DbExternalProfileRow): HotelExternalProfile {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    source: row.source as HotelExternalProfile["source"],
    externalId: row.external_id || undefined,
    externalUri: row.external_uri || undefined,
    externalUrl: row.external_url || undefined,
    externalName: row.external_name || undefined,
    externalAddress: row.external_address || undefined,
    latitude: typeof row.latitude === "number" ? row.latitude : undefined,
    longitude: typeof row.longitude === "number" ? row.longitude : undefined,
    rating: typeof row.rating === "number" ? row.rating : undefined,
    reviewsCount:
      typeof row.reviews_count === "number" ? Number(row.reviews_count) : undefined,
    matchConfidence:
      typeof row.match_confidence === "number" ? Number(row.match_confidence) : undefined,
    isActive: Number(row.is_active) !== 0,
    lastVerifiedAt: row.last_verified_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReviewFetchJobRow(row: DbReviewFetchJobRow): ReviewFetchJob {
  return {
    id: row.id,
    hotelId: row.hotel_id,
    triggerType: row.trigger_type as ReviewFetchJob["triggerType"],
    fromDate: row.from_date || undefined,
    toDate: row.to_date || undefined,
    status: row.status as ReviewFetchJob["status"],
    progressPct: Number(row.progress_pct || 0),
    currentStage: row.current_stage as ReviewFetchJob["currentStage"],
    totalCollected: Number(row.total_collected || 0),
    warningCount: Number(row.warning_count || 0),
    errorMessage: row.error_message || undefined,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReviewFetchJobSourceRow(row: DbReviewFetchJobSourceRow): ReviewFetchJobSource {
  return {
    id: row.id,
    jobId: row.job_id,
    source: row.source as ReviewFetchJobSource["source"],
    status: row.status as ReviewFetchJobSource["status"],
    collectedCount: Number(row.collected_count || 0),
    notes: row.notes || undefined,
    errorMessage: row.error_message || undefined,
    startedAt: row.started_at || undefined,
    completedAt: row.completed_at || undefined,
    updatedAt: row.updated_at
  };
}

function mapReviewWithAnalysisRowToReview(row: DbReviewWithAnalysisRow): Review {
  return {
    id: row.review_id,
    hotelId: row.review_hotel_id,
    source: row.review_source as Review["source"],
    sourceReviewId: row.review_source_review_id || undefined,
    reviewDate: row.review_date,
    rating: Number(row.review_rating),
    title: row.review_title || undefined,
    text: row.review_text,
    cleanedText: row.review_cleaned_text,
    language: row.review_language,
    authorName: row.review_author_name || undefined,
    stayTypeRaw: row.review_stay_type_raw || undefined,
    createdAt: row.review_created_at,
    updatedAt: row.review_updated_at
  };
}

function mapReviewWithAnalysisRowToAnalysis(row: DbReviewWithAnalysisRow): ReviewAnalysis {
  return {
    id: row.analysis_id,
    reviewId: row.analysis_review_id,
    sentimentLabel: row.analysis_sentiment_label as ReviewAnalysis["sentimentLabel"],
    sentimentScore: Number(row.analysis_sentiment_score),
    topics: safeParseJson(row.analysis_topics, []),
    keywords: safeParseJson(row.analysis_keywords, []),
    segmentScores: safeParseJson(row.analysis_segment_scores, emptySegmentScores()),
    primarySegment: row.analysis_primary_segment as ReviewAnalysis["primarySegment"],
    confidence: Number(row.analysis_confidence),
    explanation: safeParseJson(row.analysis_explanation, []),
    managerImpact: safeParseJson(row.analysis_manager_impact, {
      summary: "",
      operationalSignal: "",
      marketingSignal: ""
    }),
    riskFlags: safeParseJson(row.analysis_risk_flags, []),
    analyzedAt: row.analysis_analyzed_at,
    analysisVersion: row.analysis_version
  };
}

function safeParseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function emptySegmentScores(): Record<SegmentId, number> {
  return {
    business_traveler: 0,
    family: 0,
    couple: 0,
    transit_guest: 0,
    event_guest: 0,
    solo_traveler: 0,
    mixed: 0,
    unclassified: 0
  };
}

function runToSqliteRow(run: AnalysisRun) {
  return {
    id: run.id,
    hotel_id: run.hotelId,
    source_type: run.sourceType,
    total_reviews_processed: run.totalReviewsProcessed,
    status: run.status,
    started_at: run.startedAt,
    completed_at: run.completedAt || null,
    analysis_version: run.analysisVersion,
    notes: run.notes || null,
    progress_pct: typeof run.progressPct === "number" ? run.progressPct : null,
    stage: run.stage || null,
    error_message: run.errorMessage || null,
    fetched_reviews: typeof run.fetchedReviews === "number" ? run.fetchedReviews : null,
    provider: run.provider || null
  };
}

function externalProfileToSqliteRow(profile: HotelExternalProfile) {
  return {
    id: profile.id,
    hotel_id: profile.hotelId,
    source: profile.source,
    external_id: profile.externalId || null,
    external_uri: profile.externalUri || null,
    external_url: profile.externalUrl || null,
    external_name: profile.externalName || null,
    external_address: profile.externalAddress || null,
    latitude: typeof profile.latitude === "number" ? profile.latitude : null,
    longitude: typeof profile.longitude === "number" ? profile.longitude : null,
    rating: typeof profile.rating === "number" ? profile.rating : null,
    reviews_count: typeof profile.reviewsCount === "number" ? profile.reviewsCount : null,
    match_confidence:
      typeof profile.matchConfidence === "number" ? profile.matchConfidence : null,
    is_active: profile.isActive ? 1 : 0,
    last_verified_at: profile.lastVerifiedAt || null,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt
  };
}

function reviewFetchJobToSqliteRow(job: ReviewFetchJob) {
  return {
    id: job.id,
    hotel_id: job.hotelId,
    trigger_type: job.triggerType,
    from_date: job.fromDate || null,
    to_date: job.toDate || null,
    status: job.status,
    progress_pct: job.progressPct,
    current_stage: job.currentStage,
    total_collected: job.totalCollected,
    warning_count: job.warningCount,
    error_message: job.errorMessage || null,
    started_at: job.startedAt || null,
    completed_at: job.completedAt || null,
    created_at: job.createdAt,
    updated_at: job.updatedAt
  };
}

function reviewFetchJobSourceToSqliteRow(source: ReviewFetchJobSource) {
  return {
    id: source.id,
    job_id: source.jobId,
    source: source.source,
    status: source.status,
    collected_count: source.collectedCount,
    notes: source.notes || null,
    error_message: source.errorMessage || null,
    started_at: source.startedAt || null,
    completed_at: source.completedAt || null,
    updated_at: source.updatedAt
  };
}

function canonicalHotelName(name: string, city: string): string {
  const normalized = normalizeHotelMatchValue(name);
  const cityNormalized = normalizeHotelMatchValue(city);
  if (!normalized) {
    return "";
  }
  const citySuffixPattern = new RegExp(`(?:,|\\-|\\s)+${escapeRegExp(cityNormalized)}$`, "i");
  const cleaned = normalized.replace(citySuffixPattern, "").trim();
  return cleaned || normalized;
}

function normalizeHotelMatchValue(value: string): string {
  const normalized = normalizeSearchText(normalizeWhitespace(value || ""));
  return normalized
    .replace(/\b(отель|гостиница|hotel|hostel|mini-hotel|мини-отель)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeHotel(hotel: Hotel, request: CreateHotelRequest): Hotel {
  const now = new Date().toISOString();
  const nextCountry = (request.country || "").trim();
  const nextBrand = (request.brand || "").trim();
  const nextCategory = (request.category || "").trim();
  const nextAddress = (request.address || "").trim();
  const nextDescription = (request.description || "").trim();
  const nextExternalId = request.externalId?.trim();

  return {
    ...hotel,
    country: nextCountry || hotel.country,
    brand: nextBrand || hotel.brand,
    category: nextCategory || hotel.category,
    address: nextAddress || hotel.address,
    description: nextDescription || hotel.description,
    externalId: nextExternalId || hotel.externalId,
    coordinates: request.coordinates || hotel.coordinates,
    updatedAt: now
  };
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeTextHash(text: string): string {
  const normalized = normalizeWhitespace(text.toLocaleLowerCase("ru-RU"));
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const chr = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return String(hash >>> 0);
}

function applyReviewFilters(
  review: Review,
  analysis: ReviewAnalysis,
  query: ReviewsQuery
): boolean {
  if (query.sentiment && analysis.sentimentLabel !== query.sentiment) {
    return false;
  }
  if (query.segment && analysis.primarySegment !== query.segment) {
    return false;
  }
  if (query.topic && !analysis.topics.some((topic) => topic.topic === query.topic)) {
    return false;
  }
  if (query.source && review.source !== query.source) {
    return false;
  }
  if (typeof query.ratingMin === "number" && review.rating < query.ratingMin) {
    return false;
  }
  if (typeof query.ratingMax === "number" && review.rating > query.ratingMax) {
    return false;
  }
  if (query.dateFrom || query.dateTo) {
    const reviewTs = new Date(review.reviewDate).getTime();
    if (query.dateFrom) {
      const fromTs = new Date(query.dateFrom).getTime();
      if (!Number.isNaN(fromTs) && reviewTs < fromTs) {
        return false;
      }
    }
    if (query.dateTo) {
      const toTs = new Date(query.dateTo).getTime();
      if (!Number.isNaN(toTs) && reviewTs > toTs + 24 * 60 * 60 * 1000) {
        return false;
      }
    }
  }
  if (query.search) {
    const search = query.search.toLocaleLowerCase("ru-RU");
    const hasMatch =
      review.text.toLocaleLowerCase("ru-RU").includes(search) ||
      review.title?.toLocaleLowerCase("ru-RU").includes(search) ||
      analysis.keywords.some((keyword) => keyword.includes(search));
    if (!hasMatch) {
      return false;
    }
  }
  return true;
}
