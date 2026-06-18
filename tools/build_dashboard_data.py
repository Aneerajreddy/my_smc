#!/usr/bin/env python3
"""Build a compact dashboard-data.json from RA ONE signal journals and logs."""

from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "data" / "dashboard-data.json"
SYSTEMS = [
    ("XAUUSD", "XAUUSDm", "ra_one_xauusd_system", "signals_journal_xauusd.jsonl", "signal_engine_xauusd.log"),
    ("XAGUSD", "XAGUSDm", "ra_one_xagusd_system", "signals_journal_xagusd.jsonl", "signal_engine_xagusd.log"),
    ("USOIL", "USOILm", "ra_one_usoil_system", "signals_journal_usoil.jsonl", "signal_engine_usoil.log"),
    ("UKOIL", "UKOILm", "ra_one_ukoil_system", "signals_journal_ukoil.jsonl", "signal_engine_ukoil.log"),
]
FIELD_RE = re.compile(r"(\w+)=([^|]*?)(?=\s+\w+=|$)")


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def iso(value: datetime | None) -> str | None:
    return value.isoformat().replace("+00:00", "Z") if value else None


def number(value: Any, places: int = 3) -> float | None:
    try:
        return round(float(value), places)
    except (TypeError, ValueError):
        return None


def integer(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def read_log(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    events = []
    for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        parts = [part.strip() for part in line.split("|")]
        if len(parts) < 5:
            continue
        fields = {m.group(1): m.group(2).strip() for m in FIELD_RE.finditer(" | ".join(parts[5:]))}
        events.append({"time": parse_time(parts[0]), "event": parts[2], "status": parts[3], "message": parts[4], "fields": fields})
    return events


def entry(row: dict[str, Any]) -> dict[str, float | None]:
    low = number(row.get("entry_low"))
    high = number(row.get("entry_high"))
    midpoint = round((low + high) / 2, 3) if low is not None and high is not None else None
    return {"low": low, "high": high, "midpoint": midpoint}


def targets(row: dict[str, Any]) -> list[float | None]:
    return [number(row.get(f"tp{i}")) for i in range(1, 5)]


def rr(row: dict[str, Any]) -> float | None:
    e = entry(row)["midpoint"]
    sl = number(row.get("stop_loss"))
    tp4 = number(row.get("tp4"))
    if e is None or sl is None or tp4 is None or e == sl:
        return None
    return round(abs(tp4 - e) / abs(e - sl), 2)


def trim_order(row: dict[str, Any], pair: str, symbol: str) -> dict[str, Any]:
    return {
        "signal_id": row.get("signal_id"),
        "created_at": iso(parse_time(row.get("created_at"))),
        "pair": row.get("display_pair") or pair,
        "symbol": row.get("symbol") or symbol,
        "direction": str(row.get("direction", "")).upper(),
        "confidence": integer(row.get("confidence")),
        "session": row.get("session") or "",
        "ai_status": row.get("ai_status") or "",
        "mtf": row.get("mtf") or "",
        "bull_votes": integer(row.get("bull_votes")),
        "bear_votes": integer(row.get("bear_votes")),
        "strategies_confirmed": integer(row.get("strategies_confirmed")),
        "total_strategies": integer(row.get("total_strategies")),
        "entry": entry(row),
        "targets": targets(row),
        "stop_loss": number(row.get("stop_loss")),
        "break_even_pips": integer(row.get("break_even_pips")),
        "risk_reward_to_tp4": rr(row),
        "strategies": [str(x) for x in row.get("strategies", [])],
        "reasoning": [str(x) for x in row.get("reasoning", [])[:1]],
        "sentiment_label": row.get("sentiment_label") or "",
        "sentiment_score": number(row.get("sentiment_score"), 2),
        "status": "Posted",
        "status_detail": "Discord signal posted",
        "lifecycle": [],
    }


def strategy_name(value: str) -> str:
    return value.split(":", 1)[1] if ":" in value else value


def build() -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    orders = []
    symbols = []
    strategy_counts: Counter[str] = Counter()
    direction_counts: Counter[str] = Counter()
    timeline = []

    for pair, broker_symbol, folder_name, journal_name, log_name in SYSTEMS:
        folder = ROOT / folder_name
        pair_orders = [trim_order(row, pair, broker_symbol) for row in read_jsonl(folder / journal_name)]
        logs = read_log(folder / log_name)
        last = next((event for event in reversed(logs) if event["time"]), None)
        last_cycle = next((event for event in reversed(logs) if event["event"] == "CYCLE"), None)
        last_heartbeat = next((event for event in reversed(logs) if event["event"] == "HEARTBEAT"), None)
        fields = last_cycle["fields"] if last_cycle else {}
        minutes = round((now - last["time"]).total_seconds() / 60, 1) if last else None
        health = "missing" if minutes is None else "online" if minutes <= 5 else "stale" if minutes <= 30 else "offline"
        active = integer(fields.get("active"))
        cooldown = integer(fields.get("cooldown"))
        handling = "Managing active signal" if active else "Cooldown protection" if cooldown else "Scanning live market" if integer(fields.get("live")) else "Waiting for valid confluence"
        latest = max(pair_orders, key=lambda item: item.get("created_at") or "", default=None)

        for order in pair_orders:
            direction_counts.update([order["direction"]])
            strategy_counts.update(strategy_name(item) for item in order["strategies"])
        orders.extend(pair_orders)
        symbols.append({
            "pair": pair,
            "symbol": broker_symbol,
            "signal_count": len(pair_orders),
            "latest_signal": latest,
            "engine": {
                "health": health,
                "handling_state": handling,
                "last_seen_at": iso(last["time"] if last else None),
                "minutes_since_seen": minutes,
                "last_cycle": {
                    "cycle": integer(fields.get("cycle")),
                    "live": integer(fields.get("live")),
                    "active": active,
                    "cooldown": cooldown,
                    "no_signal": integer(fields.get("no_signal")),
                    "posted": integer(fields.get("posted")),
                    "errors": integer(fields.get("errors")),
                    "eta_next_signal": fields.get("eta_next_signal", "unknown"),
                    "waiting": fields.get("waiting", "unknown"),
                },
                "last_heartbeat": last_heartbeat["fields"] if last_heartbeat else {},
                "recent_events": [],
            },
        })
        timeline.extend({"timestamp": iso(event["time"]), "pair": pair, "symbol": broker_symbol, "event": event["event"], "status": event["status"], "message": event["message"], "fields": {}} for event in logs if event["time"])

    orders.sort(key=lambda item: item.get("created_at") or "", reverse=True)
    timeline.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
    confidences = [order["confidence"] for order in orders if order["confidence"]]
    summary = {
        "symbols": len(SYSTEMS),
        "orders": len(orders),
        "active_orders": sum(1 for symbol in symbols if symbol["engine"]["last_cycle"]["active"]),
        "average_confidence": round(sum(confidences) / len(confidences), 1) if confidences else 0,
        "buy_orders": direction_counts.get("BUY", 0),
        "sell_orders": direction_counts.get("SELL", 0),
        "target_events": sum(1 for item in timeline if item["event"] == "TARGET"),
        "breakeven_events": sum(1 for item in timeline if item["event"] == "BREAKEVEN"),
        "risk_events": sum(1 for item in timeline if item["event"] == "RISK"),
        "timeout_events": sum(1 for item in timeline if item["event"] == "TIMEOUT"),
    }
    return {
        "generated_at": iso(now),
        "summary": summary,
        "symbols": symbols,
        "orders": orders,
        "strategy_breakdown": [{"strategy": name, "count": count} for name, count in strategy_counts.most_common(12)],
        "timeline": timeline[:32],
    }


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(), separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT}")
