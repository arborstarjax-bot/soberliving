import { StateOfHouseView } from "./state-of-house";
import { loadStateOfHouseData, resolveRange } from "./state-of-house-data";

/**
 * State of the House tab body — heavy aggregation over activity,
 * payments, and census data. Only mounted when `tab=state`.
 */
export async function StateSection({
  houseId,
  rangeParam,
  startParam,
  endParam,
  houseTimezone,
}: {
  houseId: string;
  rangeParam: string;
  startParam: string;
  endParam: string;
  houseTimezone: string | undefined;
}) {
  const dateRange = resolveRange(rangeParam, startParam, endParam, houseTimezone);
  const stateData = await loadStateOfHouseData(houseId, dateRange);

  return (
    <StateOfHouseView
      houseId={houseId}
      range={rangeParam}
      customStart={startParam}
      customEnd={endParam}
      rangeLabel={dateRange.label}
      data={stateData}
    />
  );
}
