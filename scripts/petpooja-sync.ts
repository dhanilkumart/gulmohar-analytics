/**
 * Compatible manual entry point: --date, positional date, --from/--to and
 * default yesterday are preserved. Uses the daily worker shared lock,
 * bounded backfill, durable history and strict exit status.
 * The ingestion/orchestration implementation is unchanged.
 */
import { main } from "./petpooja-daily-sync";

void main(process.argv.slice(2), true);
