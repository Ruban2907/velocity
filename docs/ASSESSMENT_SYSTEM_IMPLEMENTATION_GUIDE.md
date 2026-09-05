# Velocity Assessment System - Full Implementation Guide

## 1. Overview

This document covers the complete assessment system implemented in Velocity, including:

- AI-powered MCQ generation using Gemini 2.5 Flash
- Recruiter-side assessment generation and management
- Direct exam link creation (without candidate sourcing dependency)
- Optional email invitation workflow
- Candidate exam-taking flow via secure token links
- Proctoring signals (focus, fullscreen, mic, camera)
- Auto-cancellation policy enforcement
- Recruiter-side submission review and per-question analysis

This guide reflects the current behavior implemented in the backend and frontend.

---

## 2. What Was Implemented

### 2.1 Recruiter Flow

1. Recruiter opens Dashboard and fills Job Specification form.
2. Form submission now generates an assessment directly (candidate sourcing is bypassed for testing flow).
3. Assessment modal shows generated 40-question MCQ paper.
4. Recruiter can:
   - Send exam by email (SMTP-based)
   - Create direct test link (no SMTP dependency)
5. Recruiter can open Assessments page to review attempts and scores.
6. Recruiter can click **View Attempt** to inspect:
   - Candidate selected answer
   - Correct answer
   - Correct/incorrect outcome
   - Explanation per question

### 2.2 Candidate Flow

1. Candidate opens exam link: `/exam/:token`
2. Exam loads token-bound attempt and question set.
3. Candidate sees side proctoring panel with live video preview.
4. Candidate can toggle mic/camera tracks (captured as integrity signals).
5. Fullscreen is requested automatically on load (with manual re-enter button fallback).
6. Candidate submits answers.
7. Score and anti-cheat metadata are stored for recruiter review.

### 2.3 Proctoring & Enforcement

Tracked signals:
- Tab/app focus switches
- Document hidden events
- Fullscreen exits
- Mic/camera permission and active track state

Enforcement policy:
- If browser focus is lost continuously, exam is auto-cancelled after 120 seconds.
- If mic/camera remains inactive continuously, exam is auto-cancelled after 120 seconds.
- Cancellation is persisted and blocked from further submission.

---

## 3. Tech Design

## 3.1 AI Generation

- Provider: Google Gemini API
- Model locked to: `gemini-2.5-flash`
- Endpoint usage: `generateContent`
- Generation prompt includes strict requirement for a raw JSON array response.

### 3.2 JSON Reliability Layer

To handle malformed model outputs, backend parsing includes:

- Markdown fence removal
- Smart quote normalization
- Array extraction from mixed text
- Trailing comma cleanup
- Fallback repair call (also through Gemini 2.5 Flash) to convert near-JSON into strict JSON

This dramatically reduces parse-failure incidents.

---

## 4. Backend Implementation

## 4.1 Main Route Group

Mounted route prefix:
- `/api/assessments`

### 4.2 Implemented Endpoints

#### `POST /api/assessments/generate` (authenticated)
Generates an assessment from job spec data.

Input (summary):
- `jobTitle`, `location`, `seniority`, `industry`, `companySize`, `skills`, `keywords`, `minExperience`, `education`

Behavior:
- Calls Gemini 2.5 Flash
- Parses and validates question array
- Stores assessment in MongoDB

Response:
- `success: true`
- saved assessment object

#### `POST /api/assessments/send` (authenticated)
Sends exam invitation email to candidate.

Input:
- `assessmentId`, `candidateEmail`, `candidateName`

Behavior:
- Creates `ExamAttempt` with token + expiry
- Sends email containing secure exam link

#### `POST /api/assessments/link` (authenticated)
Creates a direct exam link without email delivery.

Input:
- `assessmentId`, `candidateEmail`, `candidateName`

Behavior:
- Creates `ExamAttempt`
- Returns link in API response

#### `GET /api/assessments/exam/:token` (public)
Loads candidate exam by token.

Behavior:
- Validates token
- Blocks submitted/cancelled/expired attempts
- Marks attempt as started
- Returns question set without correct answers

#### `POST /api/assessments/exam/:token/submit` (public)
Submits candidate answers.

Behavior:
- Computes score
- Stores selected answers and anti-cheat signals
- Marks attempt submitted

#### `POST /api/assessments/exam/:token/cancel` (public)
Cancels exam attempt (policy violation path).

Behavior:
- Stores cancellation reason and anti-cheat snapshot
- Marks attempt as cancelled

#### `GET /api/assessments/submissions` (authenticated)
Returns recruiter-owned submission summaries.

#### `GET /api/assessments/submissions/:id` (authenticated)
Returns full submission detail with per-question breakdown:
- selected answer
- correct answer
- correctness
- explanation

---

## 5. Data Models

## 5.1 Assessment

Stores generated question paper metadata:
- `jobSpecId`
- `createdBy`
- `jobTitle`
- `questions[]`
- `generatedAt`
- `totalQuestions`

Each question includes:
- `question`
- `options[4]`
- `answer`
- `explanation`
- `difficulty`

## 5.2 ExamAttempt

Tracks each candidate attempt:
- `assessmentId`
- `recruiterId`
- `candidateEmail`, `candidateName`
- `token`
- `status` (`sent`, `started`, `submitted`, `expired`, `cancelled`)
- `startedAt`, `submittedAt`, `cancelledAt`, `cancelledReason`
- `answers`
- `score`, `totalQuestions`
- `antiCheat` object

---

## 6. Frontend Implementation

## 6.1 Job Specification Form

Current behavior:
- Form submits job spec directly to assessment generation flow
- Candidate search dependency removed for testing workflow
- Opens Assessment modal immediately after generation

## 6.2 Assessment Modal

Capabilities:
- Displays generated 40 questions
- Local answer selection and score preview
- Candidate email/name fields
- Actions:
  - Send Exam Email
  - Create Test Link
  - Copy/Open generated link

## 6.3 Candidate Exam Page (`/exam/:token`)

Capabilities:
- Loads tokenized exam
- Auto-requests fullscreen on load
- Side proctoring panel:
  - live camera preview
  - mic toggle
  - camera toggle
  - live signal summary
- Anti-cheat warning countdown (120s)
- Auto-cancel on policy violation timeout
- Submit answers and persist result

## 6.4 Assessments Page (Recruiter)

Capabilities:
- Shows attempt summary cards
- View Attempt modal with detailed per-question correctness review

---

## 7. Environment Variables

Required backend env values:

- `MONGODB_URI`
- `JWT_SECRET`
- `PORT`
- `FRONTEND_URL`
- `EXAM_BASE_URL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL=gemini-2.5-flash`

Optional/related:
- `APIFY_TOKEN` (candidate lead sourcing via Apify actor)

SMTP for email invite flow:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

---

## 8. Manual Test Checklist

### 8.1 Generate and Open Direct Test Link

1. Login as recruiter.
2. Open Dashboard and fill Job Specification.
3. Click **Generate MCQ Assessment**.
4. In modal, enter your own email/name.
5. Click **Create Test Link**.
6. Click **Open Link**.
7. Candidate exam should open.

### 8.2 Candidate Attempt + Submission

1. Keep tab focused, mic/camera active.
2. Answer questions.
3. Submit exam.
4. Confirm success message and score.

### 8.3 Policy Violation Auto-Cancel

1. Start exam.
2. Trigger one condition for >120s:
   - Lose focus continuously, or
   - Keep mic/camera inactive continuously
3. Confirm exam is auto-cancelled.
4. Token should not be submittable afterward.

### 8.4 Recruiter Result Review

1. Open Assessments page.
2. Click **View Attempt** on card.
3. Verify:
   - Candidate selected option shown
   - Correct option shown
   - Correctness highlighted
   - Explanations visible

---

## 9. Known Constraints

- Browser apps cannot guarantee OS-level lockdown (blocking all external apps globally is not possible from standard web context).
- Fullscreen auto-entry can be blocked by some browser policies; manual button remains as fallback.
- Email delivery depends on valid SMTP credentials.
- Gemini availability can still intermittently return 503 under high demand.

---

## 10. Troubleshooting

### "Gemini request failed 503"
- Cause: temporary model load spike.
- Action: retry after a short delay.

### "Failed to parse Gemini JSON response"
- Backend now includes robust parsing + repair fallback.
- If still failing, inspect raw model output logs and verify API response integrity.

### Email send failure (SMTP 535)
- Cause: invalid SMTP credentials/app password.
- Action: verify SMTP config and provider-specific app password settings.

### Exam link invalid or expired
- Ensure token was generated recently and attempt is not submitted/cancelled/expired.

---

## 11. Security Notes

- Assessment generation, link creation, and submissions list are recruiter-authenticated.
- Attempt detail endpoint validates recruiter ownership.
- Candidate exam endpoints are token-based for controlled public access.
- Do not expose API keys in frontend.

---

## 12. Future Enhancements

- Dedicated proctoring service integration
- WebRTC recording snapshots for audit trail
- Timer and section-wise exam controls
- Enhanced analytics dashboard
- Question-level tagging and competency scoring
- Resumable attempts with strict policy rules
