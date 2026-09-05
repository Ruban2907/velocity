if (process.env.NODE_ENV !== 'test') {
  require('dotenv').config();
}
const axios = require('axios');


/**
 * Proxy to Python pyresparser microservice (ai-service/app.py).
 * Expects JSON body: { documentBase64, fileName? }
 */
const parseResumePy = async (req, res) => {
  try {
    const { documentBase64, fileName, position, description } = req.body || {};

    if (!documentBase64 || typeof documentBase64 !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'documentBase64 is required (base64-encoded PDF/DOCX string)',
      });
    }

    // Strip optional data URI prefix
    const rawBase64 = documentBase64.replace(/^data:[^;]+;base64,/, '').trim();

    // Validate base64 characters
    if (!/^[A-Za-z0-9+/=]+$/.test(rawBase64)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid base64 encoding.',
      });
    }

    // Enforce 10MB file size limit (~14MB base64 string)
    const MAX_BASE64_LENGTH = 14 * 1024 * 1024;
    if (rawBase64.length > MAX_BASE64_LENGTH) {
      return res.status(413).json({
        success: false,
        message: 'Uploaded file exceeds the maximum allowed size limit of 10MB.',
      });
    }

    // Validate file extension if fileName provided
    if (fileName && !/\.(pdf|docx)$/i.test(fileName.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file type. Only PDF (.pdf) and Word (.docx) documents are accepted.',
      });
    }

    // Validate file signatures (magic bytes):
    // JVBERi = %PDF-
    // UEsDB = PK\x03\x04 (ZIP archive header used by DOCX)
    const prefix = rawBase64.slice(0, 10);
    const isPdf = prefix.startsWith('JVBERi');
    const isDocx = prefix.startsWith('UEsDB');

    if (!isPdf && !isDocx) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file format. The uploaded document does not match a valid PDF or DOCX file structure.',
      });
    }

    // Validate extension matches content structure
    if (fileName) {
      const isPdfExtension = /\.pdf$/i.test(fileName.trim());
      const isDocxExtension = /\.docx$/i.test(fileName.trim());

      if (isPdfExtension && !isPdf) {
        return res.status(400).json({
          success: false,
          message: 'File content mismatch. The file has a .pdf extension but does not contain a valid PDF structure.',
        });
      }
      if (isDocxExtension && !isDocx) {
        return res.status(400).json({
          success: false,
          message: 'File content mismatch. The file has a .docx extension but does not contain a valid DOCX structure.',
        });
      }
    }


    if (!position || !String(position).trim()) {
      return res.status(400).json({
        success: false,
        message: 'position is required for accurate matching',
      });
    }

    if (!description || !String(description).trim()) {
      return res.status(400).json({
        success: false,
        message: 'description is required for accurate matching',
      });
    }

    const baseUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    const response = await axios.post(
      `${baseUrl}/parse`,
      { documentBase64: rawBase64, fileName },
      { timeout: 60000 }
    );

    const parsed = response.data?.data ?? response.data;

    const insights = await buildResumeInsights({
      parsed,
      position,
      description,
    });

    return res.status(response.status || 200).json({
      success: response.data?.success ?? true,
      data: {
        ...(parsed || {}),
        insights,
      },
      message: response.data?.message,
    });
  } catch (err) {
    const code = err?.code;
    const isTimeout = code === 'ECONNABORTED' || code === 'ETIMEDOUT';
    const isConnectionError = code === 'ECONNREFUSED' || code === 'ENOTFOUND';
    const isNetworkError = isTimeout || isConnectionError;

    let status = err?.response?.status;
    if (!status) {
      if (isTimeout) status = 504;
      else if (isConnectionError) status = 503;
      else status = 500;
    }

    const aiBaseUrl = process.env.AI_SERVICE_URL || 'http://localhost:8001';
    let message = 'Failed to parse resume';
    if (isTimeout) {
      message = 'AI resume parser request timed out. The document may be too large or complex.';
    } else if (isConnectionError) {
      message = `AI resume parser service is not reachable at ${aiBaseUrl}. Start the Python service in ai-service/ on port 8001.`;
    } else {
      message = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Failed to parse resume';
    }

    // Log detailed error server-side for troubleshooting without dumping full payloads
    console.error(
      '[resume.parse] error',
      {
        status,
        message,
        code,
        aiBaseUrl,
        responseData: err?.response?.data?.message || err?.response?.data?.error || (typeof err?.response?.data === 'string' ? err?.response?.data?.slice(0, 200) : undefined),
      }
    );

    return res.status(status).json({
      success: false,
      message,
    });
  }
};


const cleanSkillList = (skills, max = 20) => {
  const arr = Array.isArray(skills) ? skills : [];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const s = String(raw || '').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
};

const callGeminiForRequiredSkills = async ({ position, description, maxSkills = 18 }) => {
  if (!process.env.GEMINI_API_KEY) return null;

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const prompt = `Extract the generally required skills for the following job.
Return ONLY valid JSON as an array of strings (no markdown, no extra text).
Rules:
- Skills should be short (1-3 words).
- Prefer hard skills/tools/technologies.
- Max ${maxSkills} items.

Position: ${String(position || '').trim()}
Job description:
${String(description || '').trim().slice(0, 5000)}
`;

  try {
    const response = await axios.post(
      url,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 220,
        },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
    );

    const text = response?.data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join('') || '';
    if (!text) return null;

    const parsed = JSON.parse(String(text).trim());
    if (!Array.isArray(parsed)) return null;
    return cleanSkillList(parsed, maxSkills);
  } catch {
    return null;
  }
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'he',
  'her',
  'his',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'may',
  'or',
  'our',
  'she',
  'should',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'us',
  'was',
  'we',
  'were',
  'will',
  'with',
  'you',
  'your',
  // Common job-description words that pollute keyword matching.
  'candidate',
  'candidates',
  'university',
  'bachelor',
  'bsc',
  'msc',
  'ms',
  'years',
  'year',
  'using',
  'within',
  'having',
  'background',
  'responsibility',
  'responsibilities',
  'required',
  'requirements',
  'job',
  'role',
  'position',
  'experience',
  'skills',
  'skill',
]);

const tokenize = (text) => {
  const t = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return [];
  return t
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w && w.length > 1 && !STOP_WORDS.has(w));
};

const computeTfIdfCosineSimilarity = (docA, docB) => {
  const tokensA = tokenize(docA);
  const tokensB = tokenize(docB);

  if (!tokensA.length || !tokensB.length) return 0;

  const tf = (tokens) => {
    const m = new Map();
    for (const tok of tokens) m.set(tok, (m.get(tok) || 0) + 1);
    return m;
  };

  const tfA = tf(tokensA);
  const tfB = tf(tokensB);

  const vocab = new Set([...tfA.keys(), ...tfB.keys()]);

  // N=2 documents for idf.
  const idf = (term) => {
    const df = (tfA.has(term) ? 1 : 0) + (tfB.has(term) ? 1 : 0);
    // Smooth:
    return Math.log((1 + 2) / (1 + df)) + 1;
  };

  const tfidf = (tfMap) => {
    const m = new Map();
    for (const term of vocab) {
      const count = tfMap.get(term) || 0;
      if (!count) continue;
      m.set(term, count * idf(term));
    }
    return m;
  };

  const vA = tfidf(tfA);
  const vB = tfidf(tfB);

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [, val] of vA) normA += val * val;
  for (const [, val] of vB) normB += val * val;

  if (!normA || !normB) return 0;
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  const [small, large] = vA.size < vB.size ? [vA, vB] : [vB, vA];
  for (const [term, val] of small) {
    const other = large.get(term);
    if (other) dot += val * other;
  }

  const cosine = dot / (normA * normB);
  if (!Number.isFinite(cosine)) return 0;
  return Math.max(0, Math.min(1, cosine));
};

const extractLikelySkillsFromJob = (jobText, maxSkills = 20) => {
  const text = String(jobText || '').toLowerCase();

  // Lightweight keyword extraction (no heavy NLP deps).
  const knownSkillPatterns = [
    /react|redux|next\.js/,
    /node\.js|node|express/,
    /python|django|flask/,
    /java|spring/,
    /c\+\+|c#|typescript/,
    /sql|postgres|mysql/,
    /mongodb/,
    /aws|gcp|azure/,
    /docker|kubernetes|k8s/,
    /terraform/,
    // Additions commonly seen in job posts
    /graphql/,
    /redis/,
    /kafka/,
    /microservices/,
    /tailwind|bootstrap/,
    /vue|angular/,
    /laravel/,
    /php/,
    /wordpress/,
    /flutter/,
    /react native/,
    /figma/,
    /machine learning|ml\b/,
    /deep learning|dl\b/,
    /nlp|natural language processing/,
    /data analysis|analytics|bi\b|power bi|tableau/,
    /statistics/,
    /excel/,
    /communication|stakeholder/,
  ];

  const extracted = [];

  for (const re of knownSkillPatterns) {
    if (re.test(text)) {
      extracted.push(re.toString());
    }
  }

  // Fallback: pick top frequent meaningful tokens.
  const tokens = tokenize(jobText)
    .filter((t) => t.length >= 2)
    .slice(0, 4000);
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);

  // When we have to fall back to frequent tokens, be strict so we don't
  // add generic words like "candidate", "university", etc. (those reduce
  // skill coverage and deflate the match score).
  const SKILL_TOKEN_ALLOWLIST = new Set([
    // Core stack
    'react',
    'redux',
    'next.js',
    'node',
    'node.js',
    'express',
    'python',
    'django',
    'flask',
    'java',
    'spring',
    'typescript',
    'javascript',
    'sql',
    'postgres',
    'mysql',
    'mongodb',
    'aws',
    'gcp',
    'azure',
    'docker',
    'kubernetes',
    'k8s',
    'terraform',
    // Popular extras
    'graphql',
    'redis',
    'kafka',
    'microservices',
    'tailwind',
    'bootstrap',
    'vue',
    'angular',
    'laravel',
    'php',
    'wordpress',
    'flutter',
    'figma',
    'excel',
    'tableau',
    'power',
    'bi',
    // ML
    'ml',
    'nlp',
    'api',
    'rest',
    'git',
    'github',
    'ci',
    'cd',
  ]);

  const isSkillLikeToken = (tok) => {
    const s = String(tok || '').toLowerCase().trim();
    if (!s) return false;
    if (SKILL_TOKEN_ALLOWLIST.has(s)) return true;
    // Tech tokens often contain punctuation (node.js, next.js, c#, c++).
    if (/[.#+\-]/.test(s)) return true;
    return false;
  };

  for (const [tok] of sorted) {
    if (extracted.length >= maxSkills) break;
    if (extracted.includes(tok)) continue;
    if (!isSkillLikeToken(tok)) continue;
    extracted.push(tok);
  }

  // Normalize: keep only human-ish tokens (remove regex strings like '/react|redux.../')
  const normalized = extracted
    .map((s) => {
      if (s.startsWith('/') && s.endsWith('/')) {
        return s.replace(/^\/|\/$/g, '');
      }
      return s;
    })
    .map((s) => s.replace(/\\b/g, '').replace(/\s*\|\s*/g, ','))
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .map((s) => s.replace(/\\\./g, '.').replace(/\\/g, ''))
    .map((s) => s.replace(/[()]/g, '').replace(/\?/g, ''))
    .filter(Boolean)
    .slice(0, maxSkills);

  // De-dupe (case-insensitive)
  const seen = new Set();
  const uniq = [];
  for (const s of normalized) {
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(s);
  }
  return uniq;
};

const skillsMatch = (requiredSkill, candidateSkill) => {
  const req = String(requiredSkill || '').toLowerCase().trim();
  const cand = String(candidateSkill || '').toLowerCase().trim();
  if (!req || !cand) return false;

  const compact = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9+#]+/g, '');
  const reqCompact = compact(req);
  const candCompact = compact(cand);
  if (reqCompact && candCompact && (candCompact.includes(reqCompact) || reqCompact.includes(candCompact))) {
    return true;
  }

  if (cand.includes(req) || req.includes(cand)) return true;

  const split = (s) =>
    s
      .split(/[^a-z0-9+#]+/gi)
      .map((x) => x.trim())
      .filter((x) => x.length > 1);

  const reqTokens = new Set(split(req));
  const candTokens = new Set(split(cand));
  if (!reqTokens.size || !candTokens.size) return false;

  let overlap = 0;
  for (const t of reqTokens) if (candTokens.has(t)) overlap++;
  const jaccard = overlap / (reqTokens.size + candTokens.size - overlap);

  return jaccard >= 0.25;
};

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const skillAliases = (skill) => {
  const s = String(skill || '').toLowerCase().trim();
  if (!s) return [];

  // Common aliases / variants
  const base = new Set([s]);
  base.add(s.replace(/\s+/g, ' '));
  base.add(s.replace(/\s+/g, ''));
  base.add(s.replace(/\./g, ''));
  base.add(s.replace(/\.js$/g, 'js'));
  base.add(s.replace(/js$/g, '.js'));

  if (s === 'mongodb') {
    base.add('mongo db');
    base.add('mongo-db');
  }
  if (s === 'node' || s === 'nodejs' || s === 'node.js') {
    base.add('node.js');
    base.add('nodejs');
    base.add('node');
  }
  if (s === 'next.js' || s === 'nextjs') {
    base.add('next.js');
    base.add('nextjs');
  }
  if (s === 'react native' || s === 'reactnative') {
    base.add('react native');
    base.add('reactnative');
  }
  if (s === 'power bi' || s === 'powerbi') {
    base.add('power bi');
    base.add('powerbi');
  }

  return [...base].filter(Boolean);
};

const isSkillPresentInResume = ({ requiredSkill, extractedSkills, resumeText }) => {
  const req = String(requiredSkill || '').trim();
  if (!req) return false;

  const reqLower = req.toLowerCase().trim();

  // Special case: MERN stack can appear as acronym OR as the component skills.
  if (reqLower === 'mern') {
    const mustHave = ['mongodb', 'express', 'react', 'node.js'];
    const hits = mustHave.filter((x) => isSkillPresentInResume({ requiredSkill: x, extractedSkills, resumeText }));
    return hits.length >= 3; // allow 3/4 because many resumes omit "express" explicitly
  }

  const candidates = skillAliases(req);

  // 1) Check against extracted skills list (parsed.skills)
  if (Array.isArray(extractedSkills) && extractedSkills.length) {
    for (const candSkill of extractedSkills) {
      for (const variant of candidates) {
        if (skillsMatch(variant, candSkill)) return true;
      }
    }
  }

  // 2) Check against full resume text (covers parser misses)
  const haystack = String(resumeText || '').toLowerCase();
  if (haystack) {
    for (const variant of candidates) {
      const v = variant.toLowerCase().trim();
      if (!v) continue;
      const re = new RegExp(`(^|[^a-z0-9+#])${escapeRegex(v)}([^a-z0-9+#]|$)`, 'i');
      if (re.test(haystack)) return true;
    }
  }

  return false;
};

const buildResumeTextForScoring = (parsed) => {
  const parts = [];
  parts.push(parsed?.name || '');

  if (parsed?.contact?.email) parts.push(String(parsed.contact.email));
  if (parsed?.contact?.phone) parts.push(String(parsed.contact.phone));
  if (parsed?.contact?.linkedin) parts.push(String(parsed.contact.linkedin));
  if (parsed?.contact?.github) parts.push(String(parsed.contact.github));

  if (Array.isArray(parsed?.skills)) parts.push(parsed.skills.join(' '));

  if (Array.isArray(parsed?.education)) {
    parts.push(
      parsed.education
        .map((e) => `${e.degree || ''} ${e.institution || ''} ${e.years || ''}`.trim())
        .join(' ')
    );
  }

  if (Array.isArray(parsed?.experience)) {
    parts.push(
      parsed.experience
        .map((x) => {
          const resp = Array.isArray(x.responsibilities) ? x.responsibilities.join(' ') : '';
          return `${x.role || ''} ${x.company || ''} ${x.duration || ''} ${x.location || ''} ${resp}`.trim();
        })
        .join(' ')
    );
  }

  if (Array.isArray(parsed?.projects)) {
    parts.push(
      parsed.projects
        .map((p) => `${p.name || ''} ${p.description || ''} ${p.role || ''} ${p.technologies || ''}`.trim())
        .join(' ')
    );
  }

  return parts.filter(Boolean).join('\n');
};

const callGeminiForNarrativeSummary = async ({ parsed, position, description, skillGap }) => {
  if (!process.env.GEMINI_API_KEY) return null;

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const candidate = {
    name: parsed?.name || null,
    contact: parsed?.contact || null,
    education: parsed?.education || [],
    experience: parsed?.experience || [],
    skills: parsed?.skills || [],
  };

  const job = {
    position: position || '',
    description: description || '',
  };

  const requiredSkillsText = Array.isArray(skillGap?.requiredSkills)
    ? skillGap.requiredSkills.slice(0, 12).join(", ")
    : "";

  const prompt = `Write an AI narrative summary for a recruiter about the candidate.
Rules:
1) Output EXACTLY 2 lines (two separate newline-delimited lines).
2) No bullets, no numbering, no headings.
3) Keep each line short and precise.
4) Explicitly mention the generally required skills for the specified role (from the role's required skills).

Candidate:
${JSON.stringify(candidate).slice(0, 3500)}

Job Context:
${JSON.stringify(job).slice(0, 1500)}

Skill gap analysis:
${JSON.stringify(skillGap).slice(0, 1200)}

Requirements:
- Line 1: Mention the candidate's strongest matching skills (based on the gap analysis) and 1–2 supporting signals from the resume.
- Line 2: Mention the missing skills the recruiter should evaluate, and also state the generally required skills for the role: ${requiredSkillsText || "N/A"}.`;

  try {
    const response = await axios.post(
      url,
      {
        systemInstruction: { parts: [{ text: 'You are a helpful recruiting assistant for a web app called Velocity.' }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 220,
          temperature: 0.5,
        },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      }
    );

    return (
      response?.data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text)
        .filter(Boolean)
        .join('') || null
    );
  } catch (e) {
    // Narrative summary is optional; do not fail parsing if Gemini fails.
    return null;
  }
};

const buildResumeInsights = async ({ parsed, position, description }) => {
  const skills = Array.isArray(parsed?.skills)
    ? parsed.skills.map((s) => String(s)).filter(Boolean)
    : [];
  const resumeText = buildResumeTextForScoring(parsed);
  const jobText = [position || '', description || ''].join('\n').trim();

  const geminiRequiredSkills = await callGeminiForRequiredSkills({ position, description });
  const requiredSkills = (geminiRequiredSkills && geminiRequiredSkills.length)
    ? geminiRequiredSkills
    : extractLikelySkillsFromJob(jobText);

  const presentSkills = [];
  const missingSkills = [];

  for (const req of requiredSkills) {
    const isPresent = isSkillPresentInResume({
      requiredSkill: req,
      extractedSkills: skills,
      resumeText,
    });
    if (isPresent) presentSkills.push(req);
    else missingSkills.push(req);
  }

  const resumeSkillsText = skills.join(' ').trim();
  const requiredSkillsText = requiredSkills.join(' ').trim();
  const cosineSkills =
    requiredSkillsText && resumeSkillsText
      ? computeTfIdfCosineSimilarity(requiredSkillsText, resumeSkillsText)
      : 0;
  const cosineFull = computeTfIdfCosineSimilarity(jobText, resumeText);

  let jobMatchScorePercent = 0;
  if (requiredSkills.length) {
    const skillCoverage = presentSkills.length / requiredSkills.length; // 0..1
    const combined = 0.65 * skillCoverage + 0.35 * cosineSkills; // 0..1
    jobMatchScorePercent = Math.round(Math.max(0, Math.min(1, combined)) * 100);
  } else {
    jobMatchScorePercent = Math.round(cosineFull * 100);
  }

  const profileCard = {
    name: parsed?.name || null,
    contact: parsed?.contact || null,
    topSkills: skills.slice(0, 12),
    education: Array.isArray(parsed?.education) ? parsed.education : [],
    experience: Array.isArray(parsed?.experience) ? parsed.experience : [],
  };

  const skillGap = {
    requiredSkills,
    presentSkills,
    missingSkills,
  };

  const narrativeSummary = await callGeminiForNarrativeSummary({
    parsed,
    position,
    description,
    skillGap,
  });

  return {
    profileCard,
    jobMatchScore: {
      score: jobMatchScorePercent,
      label: jobMatchScorePercent >= 75 ? 'Strong match' : jobMatchScorePercent >= 45 ? 'Moderate match' : 'Potential match',
    },
    skillGapAnalysis: skillGap,
    aiNarrativeSummary: narrativeSummary,
  };
};

module.exports = { parseResumePy };

