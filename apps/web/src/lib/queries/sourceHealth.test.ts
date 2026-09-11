import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { getAtsSourceHealth } from "./sourceHealth";

describe("getAtsSourceHealth", () => {
  it("prioritizes and maps overdue, failing, and quarantined source states", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            total: "102",
            active: "99",
            overdue: "2",
            failing: "1",
            quarantined: "1",
            job_count_anomalies: "1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "source-1",
            company_name: "Registry Tech",
            company_slug: "registry-tech",
            ats_provider: "lever",
            ats_identifier: "registry-tech",
            source_status: "active",
            consecutive_failures: 0,
            active_jobs: "12",
            last_attempted_at: new Date("2026-09-11T01:00:00Z"),
            last_succeeded_at: new Date("2026-09-10T01:00:00Z"),
            next_crawl_at: new Date("2026-09-11T02:00:00Z"),
            last_failure_code: null,
            status_reason: null,
            is_overdue: true,
            reported_job_count: 4,
            baseline_job_count: "12",
            baseline_sample_size: 3,
            is_job_count_anomaly: true,
            anomaly_detected_at: new Date("2026-09-11T01:00:00Z"),
          },
          {
            id: "source-2",
            company_name: "Quarantined Tech",
            company_slug: "quarantined-tech",
            ats_provider: "ashby",
            ats_identifier: "quarantined-tech",
            source_status: "quarantined",
            consecutive_failures: 3,
            active_jobs: "0",
            last_attempted_at: null,
            last_succeeded_at: null,
            next_crawl_at: new Date("2026-09-12T02:00:00Z"),
            last_failure_code: "parse_failed",
            status_reason: "Automatic quarantine after terminal failures",
            is_overdue: false,
            reported_job_count: null,
            baseline_job_count: null,
            baseline_sample_size: null,
            is_job_count_anomaly: null,
            anomaly_detected_at: null,
          },
          {
            id: "source-3",
            company_name: "Retry Tech",
            company_slug: "retry-tech",
            ats_provider: "greenhouse",
            ats_identifier: "retry-tech",
            source_status: "active",
            consecutive_failures: 1,
            active_jobs: "3",
            last_attempted_at: null,
            last_succeeded_at: null,
            next_crawl_at: new Date("2026-09-12T02:00:00Z"),
            last_failure_code: "http_503",
            status_reason: null,
            is_overdue: false,
            reported_job_count: null,
            baseline_job_count: null,
            baseline_sample_size: null,
            is_job_count_anomaly: null,
            anomaly_detected_at: null,
          },
        ],
      });

    const result = await getAtsSourceHealth({ query } as unknown as Pool);

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[1]).toEqual([100]);
    expect(result).toMatchObject({
      summary: {
        total: 102,
        overdue: 2,
        failing: 1,
        quarantined: 1,
        jobCountAnomalies: 1,
      },
      truncated: true,
      sources: [
        {
          id: "source-1",
          status: "overdue",
          activeJobs: 12,
          lastAttemptedAt: "2026-09-11T01:00:00.000Z",
          jobCountAnomaly: {
            reportedJobCount: 4,
            baselineJobCount: 12,
            baselineSampleSize: 3,
            detectedAt: "2026-09-11T01:00:00.000Z",
          },
        },
        {
          id: "source-2",
          status: "quarantined",
          statusReason: "Automatic quarantine after terminal failures",
        },
        { id: "source-3", status: "failing", lastFailureCode: "http_503" },
      ],
    });
  });

  it("returns an empty source-health state", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      getAtsSourceHealth({ query } as unknown as Pool),
    ).resolves.toEqual({
      summary: {
        total: 0,
        active: 0,
        overdue: 0,
        failing: 0,
        quarantined: 0,
        jobCountAnomalies: 0,
      },
      sources: [],
      truncated: false,
    });
  });
});
