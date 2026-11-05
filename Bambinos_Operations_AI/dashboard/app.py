"""
dashboard/app.py
----------------
FastAPI backend for the Bambinos.live renewal reconciliation dashboard.

It does NOT recompute the business rules. It only READS the three CSV files
produced by src/reconciliation.py and src/message_generator.py:

    output/auto_approved.csv
    output/flagged_exceptions.csv
    output/followup_messages.csv

Run from the project root (the folder that contains `dashboard/` and `output/`):

    uvicorn dashboard.app:app --reload
"""

import json
import logging
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# --------------------------------------------------------------------------
# Paths and configuration
# --------------------------------------------------------------------------
DASHBOARD_DIR = Path(__file__).resolve().parent
PROJECT_DIR = DASHBOARD_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "output"

# Only these files can be downloaded. The URL name is looked up in this dict,
# so a request like /download/../../secret.txt can never reach another file.
ALLOWED_FILES = {
    "auto_approved.csv": OUTPUT_DIR / "auto_approved.csv",
    "flagged_exceptions.csv": OUTPUT_DIR / "flagged_exceptions.csv",
    "followup_messages.csv": OUTPUT_DIR / "followup_messages.csv",
}

# Real column names written by reconciliation.py
REASON_COLUMN = "reason_codes"     # several codes joined with "|"
DECISION_COLUMN = "decision"

# Plain-English meaning of each reason code, based on the checks in
# reconciliation.py. Unknown codes still work; they just get a generic note.
REASON_DESCRIPTIONS = {
    "INVOICE_NOT_FOUND": "The invoice ID on the faculty form does not exist in the invoices file.",
    "STUDENT_NOT_FOUND": "The student ID is not in the active batches and students reference file.",
    "PAYMENT_NOT_COMPLETED": "The invoice payment status is not 'Paid'.",
    "PAYMENT_AMOUNT_MISMATCH": "The amount paid on the form differs from the invoice net amount.",
    "STUDENT_ID_MISMATCH": "The student ID on the form differs from the student ID on the invoice.",
    "USER_ID_MISMATCH": "The user ID on the form differs from the user ID on the invoice.",
    "CLASS_ID_MISMATCH": "The class ID on the form differs from the class ID on the invoice.",
    "EDUCATOR_ID_MISMATCH": "The educator ID on the form differs from the educator ID on the invoice.",
    "DUPLICATE_RENEWAL_FORM": "More than one faculty form exists for the same invoice and student.",
    "ALREADY_SCHEDULED": "This invoice already appears in the class schedule bookings file.",
    "BATCH_CAPACITY_FULL": "The student's current batch is at or above its maximum size.",
    "BATCH_CHANGE_REQUIRED": "The form says the student is not continuing in the same batch.",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("dashboard")

app = FastAPI(title="Bambinos.live Reconciliation Dashboard")
app.mount("/static", StaticFiles(directory=DASHBOARD_DIR / "static"), name="static")
templates = Jinja2Templates(directory=DASHBOARD_DIR / "templates")


# --------------------------------------------------------------------------
# Helper functions (data access)
# --------------------------------------------------------------------------
def load_csv(file_name: str):
    """
    Read one output CSV safely.

    Returns (DataFrame, status) where status is one of:
      "ok"      - file read and has rows
      "empty"   - file exists but has no data rows
      "missing" - file does not exist yet
      "error"   - file exists but could not be read (details are logged)

    Everything is read as text (dtype=str) so IDs never turn into floats and
    there are no NaN values to break JSON.
    """
    path = ALLOWED_FILES[file_name]
    if not path.exists():
        return pd.DataFrame(), "missing"
    try:
        df = pd.read_csv(path, dtype=str, keep_default_na=False)
    except pd.errors.EmptyDataError:
        return pd.DataFrame(), "empty"
    except Exception:
        logger.exception("Could not read %s", path)
        return pd.DataFrame(), "error"
    if df.empty:
        return df, "empty"
    return df, "ok"


def split_reasons(value: str) -> list:
    """'A|B' -> ['A', 'B'] (ignores blanks)."""
    return [part.strip() for part in str(value).split("|") if part.strip()]


def filter_df(df: pd.DataFrame, q: Optional[str] = None, reason: Optional[str] = None):
    """Case-insensitive search across every column, plus optional reason filter."""
    if df.empty:
        return df
    if q and q.strip():
        needle = q.strip().lower()
        mask = df.astype(str).apply(
            lambda col: col.str.lower().str.contains(needle, regex=False)
        ).any(axis=1)
        df = df[mask]
    if reason and REASON_COLUMN in df.columns:
        df = df[df[REASON_COLUMN].apply(lambda v: reason in split_reasons(v))]
    return df


def count_reasons(df: pd.DataFrame) -> Counter:
    counts = Counter()
    if not df.empty and REASON_COLUMN in df.columns:
        for value in df[REASON_COLUMN]:
            counts.update(split_reasons(value))
    return counts


def count_decisions(*frames: pd.DataFrame) -> Counter:
    counts = Counter()
    for df in frames:
        if not df.empty and DECISION_COLUMN in df.columns:
            counts.update(v for v in df[DECISION_COLUMN] if v)
    return counts


def table_payload(df: pd.DataFrame, status: str, file_name: str) -> dict:
    """Shape shared by /api/approved, /api/exceptions and /api/messages."""
    return {
        "status": status,
        "file": file_name,
        # to_json -> json.loads guarantees plain Python types (JSON serializable)
        "columns": list(df.columns),
        "count": int(len(df)),
        "records": json.loads(df.to_json(orient="records")),
    }


def last_modified() -> Optional[str]:
    times = [p.stat().st_mtime for p in ALLOWED_FILES.values() if p.exists()]
    if not times:
        return None
    return datetime.fromtimestamp(max(times)).isoformat(timespec="seconds")


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@app.get("/")
def index(request: Request):
    """Render the dashboard shell. All data is loaded by script.js via the API."""
    return templates.TemplateResponse(request, "index.html")


@app.get("/api/summary")
def summary():
    """KPI metrics, calculated from the CSV files on every request."""
    approved, s1 = load_csv("auto_approved.csv")
    flagged, s2 = load_csv("flagged_exceptions.csv")
    messages, s3 = load_csv("followup_messages.csv")

    total = len(approved) + len(flagged)
    rate = round(len(approved) / total * 100, 1) if total else 0.0

    return {
        "total_records": total,
        "auto_approved": len(approved),
        "flagged": len(flagged),
        "approval_rate": rate,
        "followups_generated": len(messages),
        "last_updated": last_modified(),
        "file_status": {
            "auto_approved.csv": s1,
            "flagged_exceptions.csv": s2,
            "followup_messages.csv": s3,
        },
    }


@app.get("/api/approved")
def approved_records():
    df, status = load_csv("auto_approved.csv")
    return table_payload(df, status, "auto_approved.csv")


@app.get("/api/exceptions")
def exception_records():
    df, status = load_csv("flagged_exceptions.csv")
    payload = table_payload(df, status, "flagged_exceptions.csv")
    # Every reason found in the data (for the filter dropdown) + explanations
    reasons = sorted(count_reasons(df))
    payload["reasons"] = reasons
    payload["reason_descriptions"] = {
        r: REASON_DESCRIPTIONS.get(r, "No description defined for this code. Review manually.")
        for r in reasons
    }
    return payload


@app.get("/api/messages")
def message_records():
    df, status = load_csv("followup_messages.csv")
    return table_payload(df, status, "followup_messages.csv")


@app.get("/api/charts")
def chart_data(
    q: Optional[str] = Query(None, max_length=100, description="Search text"),
    reason: Optional[str] = Query(None, max_length=100, description="Reason code"),
):
    """
    Chart data. The same search text used in the tables is applied here, so the
    charts update with the filters. The reason filter only applies to flagged
    records (approved records have no reason codes).
    """
    approved, _ = load_csv("auto_approved.csv")
    flagged, _ = load_csv("flagged_exceptions.csv")

    approved = filter_df(approved, q=q)
    flagged = filter_df(flagged, q=q, reason=reason)

    reasons = count_reasons(flagged)
    decisions = count_decisions(approved, flagged)
    reason_items = sorted(reasons.items(), key=lambda kv: (-kv[1], kv[0]))
    decision_items = sorted(decisions.items(), key=lambda kv: (-kv[1], kv[0]))

    return {
        "status_split": {
            "labels": ["Auto-Approved", "Flagged"],
            "values": [int(len(approved)), int(len(flagged))],
        },
        "reasons": {
            "labels": [k for k, _ in reason_items],
            "values": [v for _, v in reason_items],
        },
        "decisions": {
            "labels": [k for k, _ in decision_items],
            "values": [v for _, v in decision_items],
        },
    }


@app.get("/download/{file_name}")
def download(file_name: str):
    """Download one of the three whitelisted CSV files."""
    path = ALLOWED_FILES.get(file_name)  # unknown names (or ../ tricks) -> None
    if path is None:
        raise HTTPException(status_code=404, detail="Unknown file.")
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"{file_name} has not been generated yet. Run the reconciliation scripts first.",
        )
    return FileResponse(path, media_type="text/csv", filename=file_name)
