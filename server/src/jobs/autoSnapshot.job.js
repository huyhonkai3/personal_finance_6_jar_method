// Auto-Snapshot FinancialPeriod đã qua endDate - US4.3 AC1.
import { snapshotDuePeriods } from "../services/periodService.js";

export async function runAutoSnapshotJob(referenceDate = new Date()) {
  return snapshotDuePeriods(referenceDate);
}
