"""Medical desert detection agent."""

from __future__ import annotations

import pandas as pd

SERVICES = ["has_icu", "has_dialysis", "has_oncology", "has_trauma_care", "has_neonatal_care"]


class DesertDetectionAgent:
    def detect(self, facilities: pd.DataFrame, min_trust_score: int = 70) -> pd.DataFrame:
        df = facilities.copy()
        if "district_city" not in df and "address_city" in df:
            df["district_city"] = df["address_city"]
        if "state" not in df and "address_stateOrRegion" in df:
            df["state"] = df["address_stateOrRegion"]
        if "pin_code" not in df and "address_zipOrPostcode" in df:
            df["pin_code"] = df["address_zipOrPostcode"]

        rows: list[dict[str, object]] = []
        for keys, group in df.groupby(["state", "district_city", "pin_code"], dropna=False):
            trusted = group[group["trust_score"].fillna(0) > min_trust_score]
            missing = [service for service in SERVICES if trusted[service].fillna(False).sum() == 0]
            high_risk = len(trusted) == 0 or len(missing) >= 3
            rows.append(
                {
                    "state": keys[0],
                    "district_city": keys[1],
                    "pin_code": keys[2],
                    "facility_count": int(len(group)),
                    "trusted_facility_count": int(len(trusted)),
                    "missing_services": missing,
                    "risk_level": "high" if high_risk else ("medium" if missing else "low"),
                }
            )
        return pd.DataFrame(rows).sort_values(["risk_level", "trusted_facility_count"], ascending=[True, True])
