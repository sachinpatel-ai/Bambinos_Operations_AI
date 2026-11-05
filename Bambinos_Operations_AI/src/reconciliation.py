
import pandas as pd
from pathlib import Path

# Project paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"

OUTPUT_DIR.mkdir(exist_ok=True)

# Load all 5 datasets
invoices = pd.read_csv(DATA_DIR / "1_invoices.csv")
faculty_forms = pd.read_csv(
    DATA_DIR / "2_faculty_form_unapproved.csv"
)
booking_requests = pd.read_csv(
    DATA_DIR / "3_booking_requests.csv"
)
schedule_bookings = pd.read_csv(
    DATA_DIR / "4_class_schedule_bookings.csv"
)
reference = pd.read_csv(
    DATA_DIR / "reference_active_batches_and_students.csv"
)

# Normalize IDs for reliable matching
for df, columns in [
    (invoices, ["id", "student_id", "user_id"]),
    (faculty_forms, ["id", "invoice_id", "student_id", "user_id"]),
    (booking_requests, ["id", "faculty_form_id", "invoice_id", "student_id"]),
    (schedule_bookings, ["invoice_id", "student_id"]),
    (reference, ["student_id", "user_id", "current_classbatch_id"]),
]:
    for col in columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

# Create lookup dictionaries
invoice_lookup = invoices.set_index("id").to_dict("index")
student_lookup = reference.set_index("student_id").to_dict("index")

# Identify duplicate teacher submissions
duplicate_counts = faculty_forms.groupby(
    ["invoice_id", "student_id"]
)["id"].transform("count")

auto_approved = []
exceptions = []

for _, form in faculty_forms.iterrows():

    reasons = []

    invoice_id = form["invoice_id"]
    student_id = form["student_id"]

    invoice = invoice_lookup.get(invoice_id)
    student = student_lookup.get(student_id)

    # 1. Check invoice existence
    if invoice is None:
        reasons.append("INVOICE_NOT_FOUND")

    # 2. Check student master record
    if student is None:
        reasons.append("STUDENT_NOT_FOUND")

    # 3. Check payment status
    if invoice is not None:
        if invoice["payment_status"] != "Paid":
            reasons.append("PAYMENT_NOT_COMPLETED")

    # 4. Check invoice and form amount
    if invoice is not None:
        if abs(
            float(form["amount_paid"]) -
            float(invoice["net_amount"])
        ) > 0.01:
            reasons.append("PAYMENT_AMOUNT_MISMATCH")

    # 5. Check student ID
    if invoice is not None:
        if invoice["student_id"] != student_id:
            reasons.append("STUDENT_ID_MISMATCH")

    # 6. Check user ID
    if invoice is not None:
        if invoice["user_id"] != form["user_id"]:
            reasons.append("USER_ID_MISMATCH")

    # 7. Check class and teacher
    if invoice is not None:
        if invoice["class_id"] != form["class_id"]:
            reasons.append("CLASS_ID_MISMATCH")

        if invoice["educator_id"] != form["educator_id"]:
            reasons.append("EDUCATOR_ID_MISMATCH")

    # 8. Check duplicate form
    if duplicate_counts.loc[form.name] > 1:
        reasons.append("DUPLICATE_RENEWAL_FORM")

    # 9. Check if already scheduled
    if (
        not schedule_bookings.empty
        and (
            schedule_bookings["invoice_id"] == invoice_id
        ).any()
    ):
        reasons.append("ALREADY_SCHEDULED")

    # 10. Check batch capacity
    if student is not None:
        if (
            student["active_students_count"]
            >= student["max_batch_size"]
        ):
            reasons.append("BATCH_CAPACITY_FULL")

    # 11. Check batch change
    if form["continue_same_batch"] != "Yes":
        reasons.append("BATCH_CHANGE_REQUIRED")

    # Final decision
    if reasons:
        exceptions.append({
            "faculty_form_id": form["id"],
            "invoice_id": invoice_id,
            "student_id": student_id,
            "reason_codes": "|".join(reasons),
            "decision": "MANUAL_REVIEW"
        })

    else:
        auto_approved.append({
            "faculty_form_id": form["id"],
            "invoice_id": invoice_id,
            "student_id": student_id,
            "class_id": form["class_id"],
            "educator_id": form["educator_id"],
            "classbatch_id": form["current_classbatch_id"],
            "preferred_days": form["preferred_days"],
            "preferred_time": form["preferred_time_slot"],
            "decision": "READY_FOR_SCHEDULING"
        })

# Save results
pd.DataFrame(auto_approved).to_csv(
    OUTPUT_DIR / "auto_approved.csv",
    index=False
)

pd.DataFrame(exceptions).to_csv(
    OUTPUT_DIR / "flagged_exceptions.csv",
    index=False
)

print("Reconciliation completed!")
print("Auto-approved:", len(auto_approved))
print("Exceptions:", len(exceptions))
