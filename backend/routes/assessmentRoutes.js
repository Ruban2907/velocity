const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Assessment = require("../model/Assessment");
const ExamAttempt = require("../model/ExamAttempt");
const { authenticate } = require("../middleware/auth");

const router = express.Router(); //used to define api routes
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const stringifyField = (value) => {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  return String(value);
};

const getOptionLetter = (option, index) => {
  if (typeof option !== "string") {
    return String.fromCharCode(65 + index);
  }

  const trimmed = option.trim();
  if (/^[A-D][\.)\-:]/i.test(trimmed)) {
    return trimmed.charAt(0).toUpperCase();
  }

  return String.fromCharCode(65 + index);
};

const createTransporter = () => { //related to mails wala kaam
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

const sanitizeQuestionsForCandidate = (assessment) => //to remove sensitive data before sending to candidate
  assessment.questions.map((question) => ({
    question: question.question,
    options: question.options,
    difficulty: question.difficulty,
  }));

const normalizeJsonString = (text) => { //normalizes the text to remove invalid characters
  return String(text || "") //converts the text to a string
    .replace(/```json|```/gi, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\r\n/g, "\n")
    .trim();
};

const extractLikelyJsonArray = (text) => { //extracts the json array from the text
  const normalized = normalizeJsonString(text); //normalizes the text to remove invalid characters
  const start = normalized.indexOf("["); //finds the starting index of the json array
  const end = normalized.lastIndexOf("]"); //finds the ending index of the json array

  if (start === -1 || end === -1 || end <= start) {
    return normalized;
  }

  return normalized.slice(start, end + 1);
};

const stripTrailingCommas = (text) => text.replace(/,\s*([}\]])/g, "$1"); //removes invalid commas

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite"
];

const OVERLOAD_ERROR_CODES = [503, 429];
const OVERLOAD_KEYWORDS = [
  "UNAVAILABLE", "overloaded", "high demand", "try again", 
  "model is overloaded", "timeout", "AbortError", "ECONNABORTED"
];

const isOverloadError = (err, status) => {
  if (OVERLOAD_ERROR_CODES.includes(status)) return true;
  const msg = String(err.message || "").toLowerCase();
  return OVERLOAD_KEYWORDS.some(key => msg.includes(key.toLowerCase()));
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const callGeminiModel = async (payload, modelName, signal) => {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });

  if (response.ok) {
    return response.json();
  }

  const errorText = await response.text();
  const error = new Error(errorText || "Unknown Gemini error");
  error.status = response.status;
  throw error;
};

const generateWithRetry = async (payload) => {
  const startTime = Date.now();
  const TOTAL_TIMEOUT_MS = 45000;
  const REQUEST_TIMEOUT_MS = 30000;
  
  let lastError = null;
  let primaryModel = GEMINI_MODELS[0];

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const elapsed = Date.now() - startTime;
      
      if (elapsed > TOTAL_TIMEOUT_MS) {
        const timeoutErr = new Error("AI assessment generation is taking longer than expected. Gemini may be overloaded. Please retry in a moment.");
        timeoutErr.status = 503;
        timeoutErr.reason = "gemini_total_timeout";
        timeoutErr.timeoutMs = TOTAL_TIMEOUT_MS;
        throw timeoutErr;
      }

      // Backoff: 0ms, 1500ms, 3000ms
      if (attempt > 1) {
        const waitTime = attempt === 2 ? 1500 : 3000;
        await delay(waitTime);
      }

      console.log(`GEMINI ATTEMPT: ${model} (Attempt ${attempt}, Elapsed: ${Date.now() - startTime}ms)`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const data = await callGeminiModel(payload, model, controller.signal);
        clearTimeout(timeoutId);
        
        return {
          data,
          meta: {
            modelUsed: model,
            fallbackUsed: model !== primaryModel,
            primaryModelFailed: model !== primaryModel ? primaryModel : null,
            attempts: attempt
          }
        };
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;

        console.log(`GEMINI FAILED: ${model} (Attempt ${attempt}, Status: ${err.status})`);
        
        // If it's NOT an overload error, don't bother retrying this model
        if (!isOverloadError(err, err.status)) {
          console.log(`CRITICAL GEMINI ERROR: ${err.message?.slice(0, 200)}`);
          break; // Move to next model
        }
      }
    }
  }

  const finalErr = new Error("AI assessment generation is temporarily unavailable because Gemini is overloaded. Please retry in a few minutes.");
  finalErr.status = 503;
  finalErr.reason = "gemini_capacity_error";
  finalErr.attemptedModels = GEMINI_MODELS;
  throw finalErr;
};

const tryParseQuestions = (text) => { //tries to parse the questions from the text of ai response - convert in json obj
  const candidate = stripTrailingCommas(extractLikelyJsonArray(text));
  const parsed = JSON.parse(candidate); //converts the text to a json object

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini output is not a JSON array"); //throws an error if the output is not a json array
  }

  return parsed; 
};

const repairJsonWithGemini = async (rawText) => {
  const repairPrompt = `Convert the following content into strictly valid JSON.
Return ONLY a raw JSON array.
Do not add markdown, comments, or extra text.

Content:
${rawText}`;

  const { data, meta } = await generateWithRetry({
    contents: [{ parts: [{ text: repairPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
    },
  });
  const repairedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!repairedText) {
    throw new Error("Repair response did not contain text");
  }

  return tryParseQuestions(repairedText);
};

router.post("/generate", authenticate, async (req, res) => { //generates the assessment
  try {
    const {
      jobSpecId,
      jobTitle,
      seniority,
      industry,
      skills,
      keywords,
      minExperience,
      education,
      companySize,
    } = req.body || {};

    if (!jobTitle || (typeof jobTitle === "string" && !jobTitle.trim())) {
      return res.status(400).json({
        success: false,
        message: "jobTitle is required",
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "GEMINI_API_KEY is not configured",
      });
    }

    const prompt = `You are an expert technical assessment creator for a recruitment platform.
Generate exactly 40 multiple choice questions to assess a candidate for this role.

Job Specification:
- Title: ${stringifyField(jobTitle)}
- Seniority: ${stringifyField(seniority)}
- Industry: ${stringifyField(industry)}
- Required Skills: ${stringifyField(skills)}
- Keywords/Certifications: ${stringifyField(keywords)}
- Minimum Experience: ${stringifyField(minExperience)} years
- Education: ${stringifyField(education)}
- Company Size: ${stringifyField(companySize)}

Rules:
1. Questions must be directly relevant to the skills and job title
2. Difficulty distribution: 10 easy, 20 medium, 10 hard
3. Each question has exactly 4 options labeled A, B, C, D
4. Only one correct answer per question
5. Adjust complexity to the seniority level
6. Cover: technical knowledge, best practices, situational judgment, domain expertise
7. Include a brief explanation for each correct answer

Respond ONLY with a raw JSON array, no markdown, no backticks, no explanation outside JSON:
[
  {
    "question": "string",
    "options": ["A. text", "B. text", "C. text", "D. text"],
    "answer": "A",
    "explanation": "string",
    "difficulty": "easy|medium|hard"
  }
]`;

    const { data, meta } = await generateWithRetry({ //calls the gemini model to generate the assessment
      contents: [{ parts: [{ text: prompt }] }],
    });
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text; //text of the assessment

    if (!rawText) {//throws an error if the response does not include the assessment content
      return res.status(500).json({
        success: false,
        message: "Gemini response did not include assessment content",
      });
    }

    let questions; 
    try {
      questions = tryParseQuestions(rawText); //tries to parse the questions from the text of ai response - convert in js obj
    } catch (parseError) {
      try {
        questions = await repairJsonWithGemini(rawText); //repairs the json object if it is not valid
      } catch {
        return res.status(500).json({
          success: false,
          message: `Failed to parse Gemini JSON response: ${parseError.message}`,
        });
      }
    }

    const savedAssessment = await Assessment.create({ //save to db
      jobSpecId: jobSpecId || null,
      createdBy: req.user?._id || null,
      jobTitle: stringifyField(jobTitle),
      questions,
      generatedAt: new Date(),
      totalQuestions: questions.length,
    });

    return res.status(200).json({
      success: true,
      data: savedAssessment,
      meta: {
        ...meta,
        totalQuestions: questions.length
      }
    });
  } catch (error) {
    const statusCode = error?.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to generate assessment",
      meta: {
        reason: error.reason,
        attemptedModels: error.attemptedModels,
        timeoutMs: error.timeoutMs
      }
    });
  }
});

router.post("/send", authenticate, async (req, res) => { //email wala kaam hai ye 
  try {
    const { assessmentId, candidateEmail, candidateName } = req.body || {};

    if (!assessmentId || !candidateEmail) {
      return res.status(400).json({
        success: false,
        message: "assessmentId and candidateEmail are required",
      });
    }

    const assessment = await Assessment.findOne({ _id: assessmentId, createdBy: req.user._id });
    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: "Assessment not found",
      });
    }

    const transporter = createTransporter();

    if (!transporter) {
      return res.status(500).json({
        success: false,
        message:
          "Email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in backend .env",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const examBaseUrl = process.env.EXAM_BASE_URL || process.env.FRONTEND_URL?.split(",")[0] || "http://localhost:8081";
    const examLink = `${examBaseUrl}/exam/${token}`;

    const attempt = await ExamAttempt.create({
      assessmentId: assessment._id,
      recruiterId: req.user._id,
      candidateEmail,
      candidateName: candidateName || "Candidate",
      token,
      expiresAt,
      totalQuestions: assessment.totalQuestions,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: candidateEmail,
      subject: `Assessment Invitation: ${assessment.jobTitle}`,
      html: `
        <p>Hello ${candidateName || "Candidate"},</p>
        <p>You have been invited to complete an assessment for <strong>${assessment.jobTitle}</strong>.</p>
        <p>Click the link below to start your exam:</p>
        <p><a href="${examLink}">${examLink}</a></p>
        <p>This link expires in 24 hours.</p>
      `,
    });

    return res.status(200).json({
      success: true,
      data: {
        attemptId: attempt._id,
        examLink,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send assessment email",
    });
  }
});

router.post("/link", authenticate, async (req, res) => { //generate assessment link
  try {
    const { assessmentId, candidateEmail, candidateName } = req.body || {};

    if (!assessmentId || !candidateEmail) {
      return res.status(400).json({
        success: false,
        message: "assessmentId and candidateEmail are required",
      });
    }

    const assessment = await Assessment.findOne({ _id: assessmentId, createdBy: req.user._id });
    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: "Assessment not found",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
    const examBaseUrl = process.env.EXAM_BASE_URL || process.env.FRONTEND_URL?.split(",")[0] || "http://localhost:8081";
    const examLink = `${examBaseUrl}/exam/${token}`;

    const attempt = await ExamAttempt.create({
      assessmentId: assessment._id,
      recruiterId: req.user._id,
      candidateEmail,
      candidateName: candidateName || "Candidate",
      token,
      expiresAt,
      totalQuestions: assessment.totalQuestions,
    });

    return res.status(200).json({
      success: true,
      data: {
        attemptId: attempt._id,
        examLink,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to create exam link",
    });
  }
});

router.get("/exam/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const attempt = await ExamAttempt.findOne({ token }).populate("assessmentId");

    if (!attempt || !attempt.assessmentId) {
      return res.status(404).json({ success: false, message: "Invalid exam link" });
    }

    if (attempt.status === "submitted") {
      return res.status(400).json({ success: false, message: "This exam was already submitted" });
    }

    if (attempt.status === "cancelled") {
      return res.status(400).json({ success: false, message: "This exam was cancelled" });
    }

    if (attempt.expiresAt.getTime() < Date.now()) {
      attempt.status = "expired";
      await attempt.save();
      return res.status(400).json({ success: false, message: "This exam link has expired" });
    }

    if (!attempt.startedAt) {
      attempt.startedAt = new Date();
      attempt.status = "started";
      await attempt.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        candidateName: attempt.candidateName,
        candidateEmail: attempt.candidateEmail,
        jobTitle: attempt.assessmentId.jobTitle,
        totalQuestions: attempt.assessmentId.totalQuestions,
        questions: sanitizeQuestionsForCandidate(attempt.assessmentId),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load exam",
    });
  }
});

router.post("/exam/:token/submit", async (req, res) => {
  try {
    const { token } = req.params;
    const { answers, antiCheat } = req.body || {};
    const attempt = await ExamAttempt.findOne({ token }).populate("assessmentId");

    if (!attempt || !attempt.assessmentId) {
      return res.status(404).json({ success: false, message: "Invalid exam link" });
    }

    if (attempt.status === "submitted") {
      return res.status(400).json({ success: false, message: "This exam was already submitted" });
    }

    if (attempt.status === "cancelled") {
      return res.status(400).json({ success: false, message: "This exam was cancelled" });
    }

    const questions = attempt.assessmentId.questions || [];
    const safeAnswers = answers && typeof answers === "object" ? answers : {};

    let score = 0; //score of the exam initially 0
    questions.forEach((question, index) => { //loop through the questions
      const expected = String(question.answer || "").trim().toUpperCase(); //expected answer
      const submittedRaw = safeAnswers[index] || safeAnswers[String(index)] || "";
      const submitted = String(submittedRaw).trim().toUpperCase();

      if (!submitted && Array.isArray(question.options)) {
        const optionIndex = Number(submittedRaw);
        if (!Number.isNaN(optionIndex) && optionIndex >= 0 && optionIndex < question.options.length) {
          const optionLetter = getOptionLetter(question.options[optionIndex], optionIndex);
          if (optionLetter === expected) {
            score += 1;
          }
          return;
        }
      }

      if (submitted === expected) {
        score += 1;
      }
    });

    attempt.answers = safeAnswers; //save attempt data here in db
    attempt.score = score;
    attempt.totalQuestions = questions.length;
    attempt.submittedAt = new Date();
    attempt.status = "submitted";
    attempt.antiCheat = { //anti cheat data
      tabSwitchCount: Number(antiCheat?.tabSwitchCount) || 0,
      fullScreenExitCount: Number(antiCheat?.fullScreenExitCount) || 0,
      visibilityHiddenCount: Number(antiCheat?.visibilityHiddenCount) || 0,
      micPermissionGranted: Boolean(antiCheat?.micPermissionGranted),
      cameraPermissionGranted: Boolean(antiCheat?.cameraPermissionGranted),
      micTrackActive: Boolean(antiCheat?.micTrackActive),
      cameraTrackActive: Boolean(antiCheat?.cameraTrackActive),
      integrityNotes: antiCheat?.integrityNotes || "",
    };

    await attempt.save();

    return res.status(200).json({
      success: true,
      data: {
        score,
        totalQuestions: questions.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to submit exam",
    });
  }
});

router.post("/exam/:token/cancel", async (req, res) => {
  try {
    const { token } = req.params;
    const { reason, antiCheat } = req.body || {};
    const attempt = await ExamAttempt.findOne({ token });

    if (!attempt) {
      return res.status(404).json({ success: false, message: "Invalid exam link" });
    }

    if (attempt.status === "submitted") {
      return res.status(400).json({ success: false, message: "Cannot cancel a submitted exam" });
    }

    if (attempt.status === "cancelled") {
      return res.status(200).json({ success: true, message: "Exam already cancelled" });
    }

    attempt.status = "cancelled";
    attempt.cancelledAt = new Date();
    attempt.cancelledReason = reason || "Policy violation";
    attempt.antiCheat = {
      tabSwitchCount: Number(antiCheat?.tabSwitchCount) || attempt.antiCheat?.tabSwitchCount || 0,
      fullScreenExitCount: Number(antiCheat?.fullScreenExitCount) || attempt.antiCheat?.fullScreenExitCount || 0,
      visibilityHiddenCount: Number(antiCheat?.visibilityHiddenCount) || attempt.antiCheat?.visibilityHiddenCount || 0,
      micPermissionGranted:
        typeof antiCheat?.micPermissionGranted === "boolean"
          ? antiCheat.micPermissionGranted
          : attempt.antiCheat?.micPermissionGranted || false,
      cameraPermissionGranted:
        typeof antiCheat?.cameraPermissionGranted === "boolean"
          ? antiCheat.cameraPermissionGranted
          : attempt.antiCheat?.cameraPermissionGranted || false,
      micTrackActive:
        typeof antiCheat?.micTrackActive === "boolean"
          ? antiCheat.micTrackActive
          : attempt.antiCheat?.micTrackActive || false,
      cameraTrackActive:
        typeof antiCheat?.cameraTrackActive === "boolean"
          ? antiCheat.cameraTrackActive
          : attempt.antiCheat?.cameraTrackActive || false,
      integrityNotes: antiCheat?.integrityNotes || attempt.antiCheat?.integrityNotes || "",
    };

    await attempt.save();

    return res.status(200).json({
      success: true,
      message: "Exam cancelled",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel exam",
    });
  }
});

router.get("/submissions", authenticate, async (req, res) => {
  try {
    const attempts = await ExamAttempt.find({ recruiterId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("assessmentId", "jobTitle totalQuestions");

    const data = attempts.map((attempt) => ({
      id: attempt._id,
      candidateName: attempt.candidateName,
      candidateEmail: attempt.candidateEmail,
      status: attempt.status,
      score: attempt.score,
      totalQuestions: attempt.totalQuestions,
      submittedAt: attempt.submittedAt,
      startedAt: attempt.startedAt,
      antiCheat: attempt.antiCheat,
      jobTitle: attempt.assessmentId?.jobTitle || "Assessment",
    }));

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch submissions",
    });
  }
});

router.get("/submissions/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const attempt = await ExamAttempt.findOne({ _id: id, recruiterId: req.user._id }).populate("assessmentId");

    if (!attempt || !attempt.assessmentId) {
      return res.status(404).json({
        success: false,
        message: "Submission not found",
      });
    }

    const answersMap = attempt.answers || new Map();
    const questionBreakdown = (attempt.assessmentId.questions || []).map((question, index) => {
      const selectedRaw =
        (typeof answersMap.get === "function" ? answersMap.get(String(index)) : undefined) ||
        answersMap[String(index)] ||
        answersMap[index] ||
        "";

      let selectedAnswer = String(selectedRaw || "").trim().toUpperCase();
      if (!selectedAnswer && selectedRaw !== "" && selectedRaw !== null && selectedRaw !== undefined) {
        const optionIndex = Number(selectedRaw);
        if (!Number.isNaN(optionIndex) && optionIndex >= 0 && optionIndex < (question.options || []).length) {
          selectedAnswer = getOptionLetter(question.options[optionIndex], optionIndex);
        }
      }

      const correctAnswer = String(question.answer || "").trim().toUpperCase();

      return {
        index,
        question: question.question,
        options: question.options,
        selectedAnswer,
        correctAnswer,
        isCorrect: selectedAnswer !== "" && selectedAnswer === correctAnswer,
        explanation: question.explanation,
        difficulty: question.difficulty,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        id: attempt._id,
        candidateName: attempt.candidateName,
        candidateEmail: attempt.candidateEmail,
        status: attempt.status,
        score: attempt.score,
        totalQuestions: attempt.totalQuestions,
        submittedAt: attempt.submittedAt,
        startedAt: attempt.startedAt,
        cancelledAt: attempt.cancelledAt,
        cancelledReason: attempt.cancelledReason,
        antiCheat: attempt.antiCheat,
        jobTitle: attempt.assessmentId?.jobTitle || "Assessment",
        questionBreakdown,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch submission detail",
    });
  }
});

module.exports = router;
