# Bambinos.live — AI Operations Automation

## Student Renewal to Class Scheduling Pipeline

### Project Overview

This project focuses on re-engineering and automating the student renewal-to-class scheduling process at Bambinos.live.

The goal is to reduce manual operational work, minimize delays after payment, improve data accuracy, and ensure students are scheduled for their next classes without unnecessary interruptions.

The solution uses data reconciliation, rule-based automation, exception handling, and an operations dashboard to support the renewal workflow.

## Problem Statement

Bambinos.live manages student renewals through multiple operational stages:

1. Invoice creation after parent payment.
2. Teacher submission of renewal details.
3. Operations verification and approval.
4. Parent or Operations team class scheduling.

Manual handoffs between these stages can lead to:

- Paid students waiting for class scheduling.
- Missing or incorrect teacher renewal forms.
- Invoice and student data mismatches.
- Duplicate booking requests.
- Delayed approvals.
- Payment verification issues.
- Repeated follow-ups with teachers and parents.

This project aims to streamline the workflow by identifying valid renewals, automatically processing clean records, and routing exceptions to the appropriate team.

## Project Objectives

- Reconcile invoice, faculty form, booking request, and scheduling records.
- Identify eligible renewals for auto-approval.
- Detect data inconsistencies and operational exceptions.
- Generate actionable follow-up messages.
- Reduce manual verification workload.
- Improve payment-to-scheduling turnaround time.
- Provide visibility into pending and completed operations.

## Workflow Architecture

```text
Parent Payment
      |
      v
Invoices
      |
      v
Faculty Renewal Form
      |
      v
Data Reconciliation Engine
      |
      +--------------------------+
      |                          |
      v                          v
Clean Records              Exceptions
      |                          |
      v                          v
Auto-Approval              Review & Follow-up
      |                          |
      v                          v
Booking Requests           Ops / Teacher / Parent
      |
      v
Class Schedule Bookings
      |
      v
Operations Dashboard
```

## Technology Stack

### Backend & Data Processing
- Python
- Pandas
- FastAPI
- Uvicorn

### Frontend
- HTML
- CSS
- JavaScript

### Data Sources
- CSV datasets
- Invoice records
- Faculty renewal forms
- Booking requests
- Class scheduling records
- Active batches and student reference data

## Project Structure

```text
Bambinos_Operations_AI/
├── dashboard/
│   ├── app.py
│   ├── templates/
│   └── static/
├── data/
│   ├── 1_invoices.csv
│   ├── 2_faculty_form_unapproved.csv
│   ├── 3_booking_requests.csv
│   ├── 4_class_schedule_bookings.csv
│   └── reference_active_batches_and_students.csv
├── src/
│   ├── reconciliation.py
│   └── message_generator.py
├── output/
│   ├── auto_approved.csv
│   ├── flagged_exceptions.csv
│   └── followup_messages.csv
├── README.md
├── requirements.txt
└── .gitignore
```

## Core Features

### 1. Data Reconciliation

The reconciliation engine processes the provided operational datasets to identify relationships between:

- Invoices
- Faculty renewal forms
- Booking requests
- Class schedule bookings
- Active batches and students

It checks the available records and determines which renewals can proceed through the automated workflow.

### 2. Auto-Approval Engine

Clean and eligible renewal records are identified for auto-approval.

The system is designed to support the happy path, such as a student continuing in the same batch with the same teacher, while avoiding unnecessary manual verification.

### 3. Exception Handling

Records that fail validation are routed for review.

Potential exception categories include:

- Missing invoice
- Payment mismatch
- Student ID mismatch
- Incorrect invoice amount
- Missing faculty form
- Duplicate renewal record
- Invalid batch
- Partial payment
- Existing booking
- Missing required information

Exception reasons should be based on the available data and validation rules.

### 4. Follow-up Message Generation

The system generates draft follow-up messages for relevant stakeholders:

- Teachers
- Parents
- Operations team

Messages are intended to explain the issue and recommend the next action.

Generated messages require human review before being sent.

### 5. Operations Dashboard

The dashboard provides visibility into the renewal pipeline.

Key operational indicators include:

- Total invoices
- Paid invoices
- Pending renewal forms
- Auto-approved records
- Flagged exceptions
- Unscheduled bookings
- Payment-to-scheduling turnaround time

The dashboard supports monitoring of operational bottlenecks and pending tasks.

## Operational Metrics

The following metrics can be used to evaluate workflow performance:

| Metric | Definition |
|---|---|
| Orphaned Invoice Rate | Percentage of paid invoices without a matching renewal form |
| Payment-to-Schedule Turnaround Time | Time between confirmed payment and class scheduling |
| Auto-Approval Rate | Percentage of eligible renewals processed automatically |
| Exception Rate | Percentage of renewal records requiring manual review |
| Unscheduled Paid Students | Number of paid students without a confirmed class schedule |
| Faculty Form Completion Rate | Percentage of required renewal forms submitted |
| SLA Breach Rate | Percentage of records exceeding the defined processing SLA |

## Installation

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd Bambinos_Operations_AI
```

### 2. Create a Virtual Environment

```bash
python -m venv .venv
```

### 3. Activate the Environment

For Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

### 4. Install Dependencies

```bash
pip install -r requirements.txt
```

## Running the Project

### Run the Reconciliation Engine

```bash
python src/reconciliation.py
```

### Generate Follow-up Messages

```bash
python src/message_generator.py
```

### Run the Dashboard

```bash
uvicorn dashboard.app:app --reload
```

Open the dashboard in your browser:

```text
http://127.0.0.1:8000
```

## Output Files

| File | Description |
|---|---|
| `auto_approved.csv` | Renewal records identified as eligible for automated approval |
| `flagged_exceptions.csv` | Records requiring manual review with exception reasons |
| `followup_messages.csv` | Draft follow-up messages for relevant stakeholders |

## Business Impact

The proposed solution is designed to:

- Reduce repetitive manual verification.
- Improve visibility into paid-but-unscheduled students.
- Reduce operational delays.
- Improve data consistency across renewal stages.
- Enable faster exception resolution.
- Support the Operations team in handling higher renewal volumes.

Actual operational impact should be measured through pilot results and before-and-after SLA comparisons.

## Limitations

- The current prototype is based on the provided datasets.
- Automated decisions depend on the implemented validation rules.
- Records with ambiguous or inconsistent information require human review.
- Follow-up messages are drafts and are not automatically sent.
- The prototype does not directly modify production scheduling systems.

## Future Enhancements

- Integrate with live payment gateway APIs.
- Add automated WhatsApp notifications.
- Implement real-time data synchronization.
- Introduce configurable SLA alerts.
- Add role-based access for Teachers and Operations.
- Improve exception prioritization.
- Add historical analytics and renewal forecasting.

## Responsible Automation

The system follows a human-in-the-loop approach.

- Only validated records should be eligible for auto-approval.
- Payment status must be verified before scheduling.
- Ambiguous records should be flagged rather than guessed.
- Operational changes should be reviewed before production rollout.
- Student and parent information should be protected.

## Author

**Sachin Patel**

AI/ML Developer | MCA Student

