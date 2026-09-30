"""Secret-free readiness summary, separate from process liveness."""


def readiness(summary, *, enabled, worker_error, last_heartbeat, now):
    reasons = []
    if not enabled:
        reasons.append("WORKER_DISABLED")
    elif last_heartbeat is None or now - last_heartbeat > 180:
        reasons.append("WORKER_NOT_RESPONDING")
    if worker_error:
        reasons.append("WORKER_ERROR")
    if summary["model_blocks"]:
        reasons.append("MODEL_BLOCKED")
    if any(r["result_kind"] == "TECHNICAL_ERROR" for r in summary.get("latest_analysis", [])):
        reasons.append("LATEST_ANALYSIS_FAILED")
    for state in ("DELIVERY_UNKNOWN", "DELIVERY_FAILED"):
        if summary["counts"].get(state, 0):
            reasons.append(state)
    oldest = summary["oldest_pending_at"]
    if oldest is not None and now - oldest > 21600:
        reasons.append("BACKLOG_OLDER_THAN_6H")
    return {"status": "attention_required" if reasons else "ready", "reasons": reasons}
