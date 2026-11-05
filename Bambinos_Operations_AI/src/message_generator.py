
import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "output"

OUTPUT_DIR.mkdir(exist_ok=True)

# Read exception report
exceptions = pd.read_csv(
    OUTPUT_DIR / "flagged_exceptions.csv"
)

def generate_message(row):

    reasons = row["reason_codes"]

    if "PAYMENT_NOT_COMPLETED" in reasons:
        return (
            "Hi Parent, we could not confirm the renewal payment. "
            "Please verify the payment status with the Operations team."
        )

    if "PAYMENT_AMOUNT_MISMATCH" in reasons:
        return (
            "Hi Teacher, the payment amount in the renewal form "
            "does not match the invoice. Please verify the details."
        )

    if "INVOICE_NOT_FOUND" in reasons:
        return (
            "Hi Teacher, the invoice linked to this renewal "
            "could not be found. Please submit the correct invoice."
        )

    if "DUPLICATE_RENEWAL_FORM" in reasons:
        return (
            "Hi Operations, duplicate renewal submissions were detected. "
            "Please review and retain only the valid request."
        )

    if "BATCH_CAPACITY_FULL" in reasons:
        return (
            "Hi Operations, the requested batch has reached its capacity. "
            "Please check available alternative batches."
        )

    if "BATCH_CHANGE_REQUIRED" in reasons:
        return (
            "Hi Parent, we received your batch change request. "
            "Operations will check available batches and confirm the schedule."
        )

    return (
        "Hi Operations, this renewal requires manual review. "
        f"Reason: {reasons}. Please investigate."
    )


exceptions["followup_message"] = exceptions.apply(
    generate_message,
    axis=1
)

exceptions.to_csv(
    OUTPUT_DIR / "followup_messages.csv",
    index=False
)

print("Follow-up messages generated successfully!")
