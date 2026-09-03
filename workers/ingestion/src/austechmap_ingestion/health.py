from dataclasses import dataclass
from typing import Literal, TypedDict


class HealthPayload(TypedDict):
    service: Literal["ingestion"]
    status: Literal["ok"]
    version: Literal[1]
    runId: str


@dataclass(frozen=True)
class WorkerHealth:
    service: Literal["ingestion"] = "ingestion"
    status: Literal["ok"] = "ok"
    version: Literal[1] = 1
    runId: str = "local"

    def as_payload(self) -> HealthPayload:
        return {
            "service": self.service,
            "status": self.status,
            "version": self.version,
            "runId": self.runId,
        }


def build_health(run_id: str) -> HealthPayload:
    if not run_id.strip():
        raise ValueError("run_id must not be empty")

    return WorkerHealth(runId=run_id).as_payload()
