const express = require("express");
const { fetchLeadsFromApify, buildApifyInput } = require("../services/apifyLeadService");
const JobSpec = require("../model/JobSpec");
const Candidate = require("../model/Candidate");
const SearchCache = require("../model/SearchCache");
const {
  normalizeCandidateSearchInput,
  createSearchHash
} = require("../utils/cacheHelper");
const { authenticate } = require("../middleware/auth");
const { searchLimiter } = require("../middleware/rateLimiter");

const router = express.Router();


function sendCandidateResponse(res, {
  success = true,
  message = "",
  candidates = [],
  meta = {},
  status = 200
}) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];

  console.log("🚀 FINAL NORMALIZED CANDIDATE RESPONSE:", {
    success,
    message,
    candidatesLength: safeCandidates.length,
    meta
  });

  return res.status(status).json({
    success,
    message,
    candidates: safeCandidates,
    data: safeCandidates, // temporary backwards compatibility
    meta
  });
}

const normalizeString = (value) => String(value || "").trim().toLowerCase();

const toArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

const hasTokenMatch = (candidateText, tokens) => {
  const haystack = normalizeString(candidateText);
  if (!haystack || !tokens.length) return false;
  return tokens.some((token) => haystack.includes(normalizeString(token)));
};

const deriveMatchLabel = (score) => {
  if (score >= 75) return "Strong match";
  if (score >= 45) return "Moderate match";
  return "Low match";
};

const rankCandidate = (candidate, jobData) => {
  const reasons = [];
  let score = 0;

  const titleTokens = toArray(jobData?.jobTitle);
  const locationTokens = toArray(jobData?.location);
  const seniorityTokens = toArray(jobData?.seniority);
  const industryTokens = toArray(jobData?.industry).map((x) => x.replace(/_/g, " "));
  const keywordTokens = toArray(jobData?.keywords);
  const skillTokens = toArray(jobData?.postFilters?.skills);
  const needsEmail = Boolean(jobData?.emailRequired);

  const title = String(candidate?.title || "");
  const seniority = String(candidate?.seniority || "");
  const location = String(candidate?.location || "");
  const industry = String(candidate?.companyIndustry || "");
  const company = String(candidate?.companyName || "");
  const email = String(candidate?.email || "");

  const searchableText = [title, seniority, location, industry, company].join(" ");

  const titleMatched = hasTokenMatch(title, titleTokens);
  if (titleMatched) {
    score += 35;
    reasons.push("title matched");
  }

  const seniorityMatched = hasTokenMatch(seniority, seniorityTokens);
  if (seniorityMatched) {
    score += 20;
    reasons.push("seniority matched");
  }

  const locationMatched = hasTokenMatch(location, locationTokens);
  if (locationMatched) {
    score += 15;
    reasons.push("location matched");
  }

  const industryMatched = hasTokenMatch(industry, industryTokens);
  if (industryMatched) {
    score += 10;
    reasons.push("industry matched");
  }

  const keywordsMatched = hasTokenMatch(searchableText, keywordTokens);
  if (keywordsMatched) {
    score += 15;
    reasons.push("keyword overlap");
  }

  if (needsEmail && email) {
    score += 5;
    reasons.push("email available");
  }

  const skillsMatched = hasTokenMatch(searchableText, skillTokens);
  if (skillTokens.length > 0 && skillsMatched) {
    score += 5;
    reasons.push("skills overlap");
  }

  const passesEmailFilter = !needsEmail || Boolean(email);
  // Relaxing skill filter: We want to show matches even if skills aren't perfectly matched by string
  const passesFilters = passesEmailFilter;

  return {
    score: Math.max(0, Math.min(100, score)),
    label: deriveMatchLabel(score),
    reasons,
    passesFilters,
  };
};

router.post("/search", authenticate, searchLimiter, async (req, res) => {
  try {
    const { jobId } = req.body || {};

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "jobId is required",
      });
    }

    // 2. Fetch JobSpec
    const jobData = await JobSpec.findById(jobId);
    if (!jobData) {
      return sendCandidateResponse(res, {
        success: false,
        message: "Job not found",
        status: 404
      });
    }

    // Authorization check: recruiter must own the job spec or be an admin
    if (jobData.createdBy && req.user.role !== 'admin' && !jobData.createdBy.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to search candidates for this job specification.",
      });
    }


    // 3. Check existing candidates
    const existingCandidates = await Candidate.find({ jobId });
    if (existingCandidates.length > 0) {
      const rankedExisting = existingCandidates
        .map((candidate) => {
          const ranking = rankCandidate(candidate, jobData);
          return {
            ...candidate.toObject(),
            matchScore: ranking.score,
            matchLabel: ranking.label,
            rankingReasons: ranking.reasons,
          };
        })
        .sort((a, b) => b.matchScore - a.matchScore);

      return sendCandidateResponse(res, {
        success: true,
        message: "Existing candidates loaded from database.",
        candidates: rankedExisting
      });
    }

    // 4. A. Check Search Cache
    const apifyInput = buildApifyInput(jobData);
    const normalizedQuery = normalizeCandidateSearchInput(apifyInput);
    const queryHash = createSearchHash(normalizedQuery);

    console.log("SEARCH CACHE NORMALIZED QUERY:", normalizedQuery);
    console.log("SEARCH CACHE QUERY HASH:", queryHash);

    const cachedSearch = await SearchCache.findOne({ queryHash });

    console.log("SEARCH CACHE HIT:", !!cachedSearch);
    console.log("SEARCH CACHE CANDIDATE COUNT:", cachedSearch?.candidates?.length || 0);

    if (cachedSearch && Array.isArray(cachedSearch.candidates) && cachedSearch.candidates.length > 0) {
      return sendCandidateResponse(res, {
        success: true,
        message: "Candidates loaded from saved search cache.",
        candidates: cachedSearch.candidates.slice(0, jobData.perPage || 25),
        meta: {
          source: "search_cache",
          cachedCount: cachedSearch.candidates.length,
          queryHash,
          normalizedQuery
        }
      });
    }

    // 4. B. Call Apify
    let rawLeads = [];
    let apifyMetadata = { rawCount: 0, realItemsCount: 0 };
    
    try {
      const apifyResult = await fetchLeadsFromApify(jobData);
      rawLeads = apifyResult.items;
      apifyMetadata = apifyResult.metadata;
    } catch (apifyError) {
      console.error("Apify execution error:", apifyError?.message || apifyError);
      return sendCandidateResponse(res, {
        success: false,
        message: apifyError?.message || "Lead sourcing failed",
        status: 500
      });
    }

    const metaBase = {
      rawCount: apifyMetadata.rawCount,
      realItemsCount: apifyMetadata.realItemsCount,
      cleanedCount: 0,
      beforeTitleFilter: 0,
      afterTitleFilter: 0,
      rejectedTitleSamples: []
    };

    if (!rawLeads || rawLeads.length === 0) {
      return sendCandidateResponse(res, {
        success: true,
        message: "No leads returned from Apify for this search.",
        candidates: [],
        meta: metaBase
      });
    }

      // 4. C. Clean leads with robust mapping and flexible rules
    const cleanedLeads = [];
    const rejectReasons = [];
    
    console.log("RAW APIFY LEADS COUNT:", rawLeads.length);

    for (const lead of rawLeads) {
      if (lead.rowType === "diagnostic") {
        rejectReasons.push("Skipped diagnostic row");
        continue;
      }

      // Robust Mapping with Fallbacks
      const nameStr = (lead.name || lead.fullName || lead.personName || `${lead.firstName || ""} ${lead.lastName || ""}`.trim()).trim();
      const titleStr = (lead.title || lead.jobTitle || lead.position || lead.headline || lead.currentTitle || lead.currentJobTitle || "").trim();
      const companyStr = (lead.companyName || lead.company || lead.organizationName || lead.organization || lead.currentCompany || lead.currentCompanyName || "").trim();
      const emailStr = (lead.email || lead.emailAddress || lead.workEmail || lead.personalEmail || "").trim();
      const linkedinStr = (lead.linkedinUrl || lead.linkedin_url || lead.profileUrl || lead.personLinkedinUrl || lead.linkedinProfile || "").trim();
      
      let finalLinkedin = linkedinStr;
      if (finalLinkedin && !finalLinkedin.startsWith("http")) {
        finalLinkedin = "https://" + finalLinkedin.replace(/^\/*/, "");
      }

      const locationStr = (lead.location || lead.city || lead.personLocation || [lead.personCity, lead.personCountry].filter(Boolean).join(", ").trim()).trim();
      const phoneStr = (lead.phone || lead.phoneNumber || lead.mobilePhone || lead.workPhone || "").trim();

      // Check core validity: Accept if it has at least one identifying piece of info
      const hasCoreInfo = nameStr || finalLinkedin || titleStr || companyStr || emailStr;
      
      if (!hasCoreInfo) {
        rejectReasons.push(`Dropped row: Missing all core info (Name/Title/Company/Email/LinkedIn)`);
        continue;
      }

      // Email Requirement Check
      if (jobData.emailRequired === true && !emailStr) {
        rejectReasons.push(`Dropped row: Email required but missing for ${nameStr || "Unknown"}`);
        continue;
      }

      const arrayToString = (val) => {
        if (val === undefined || val === null) return "";
        if (Array.isArray(val)) return val.join(", ").trim();
        const str = String(val).trim();
        return str.toLowerCase() === "n/a" ? "" : str;
      };

      cleanedLeads.push({
        name: arrayToString(nameStr),
        title: arrayToString(titleStr),
        seniority: arrayToString(lead.seniority || lead.personSeniority),
        email: arrayToString(emailStr),
        emailStatus: arrayToString(lead.emailStatus || lead.email_status),
        phone: arrayToString(phoneStr),
        linkedinUrl: arrayToString(finalLinkedin),
        location: arrayToString(locationStr),
        companyName: arrayToString(companyStr),
        companyDomain: arrayToString(lead.companyDomain || lead.domain),
        companyIndustry: arrayToString(lead.companyIndustry || lead.industry),
        companySize: arrayToString(lead.companySize || lead.sizeRange)
      });
    }

    const cleanedCount = cleanedLeads.length;
    console.log("CLEANED LEADS COUNT:", cleanedCount);

    if (rawLeads.length > 0 && cleanedCount === 0) {
      return sendCandidateResponse(res, {
        success: true,
        message: "Leads were found but none passed cleaning. Check cleaner rules.",
        candidates: [],
        meta: { ...metaBase, cleanedCount: 0 }
      });
    }

    // 5. Strict Role Filtering with Synonyms
    const LEVEL_WORDS = [
      "associate", "senior", "junior", "intern", "entry",
      "lead", "manager", "director", "principal", "staff"
    ];

    const ROLE_SYNONYMS = {
      engineer: ["engineer", "developer"],
      software: ["software", "backend", "frontend", "fullstack", "full-stack", "mern", "node", "react", "javascript"]
    };

    const SOFTWARE_ROLE_TERMS = [
      "software", "engineer", "developer", "backend", "frontend",
      "fullstack", "full-stack", "mern", "node", "react", "javascript"
    ];

    function getCoreRoleWords(searchTitle) {
      return String(searchTitle || "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .filter(word => !LEVEL_WORDS.includes(word));
    }

    function fallbackCoreRoleMatches(candidateTitle, searchTitles) {
      const title = String(candidateTitle || "").toLowerCase();

      return (searchTitles || []).some(search => {
        const coreWords = getCoreRoleWords(search);

        if (!coreWords.length) return false;

        const isSoftwareSearch =
          coreWords.includes("software") ||
          coreWords.includes("engineer") ||
          coreWords.includes("developer");

        if (isSoftwareSearch) {
          return SOFTWARE_ROLE_TERMS.some(term => title.includes(term));
        }

        return coreWords.some(word => title.includes(word));
      });
    }

    function splitTitleSearch(searchTitle) {
      const words = String(searchTitle || "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      return {
        levels: words.filter(w => LEVEL_WORDS.includes(w)),
        coreRole: words.filter(w => !LEVEL_WORDS.includes(w)).join(" ")
      };
    }

    function strictRoleFilter(candidateTitle, originalSearchTitles) {
      const title = String(candidateTitle || "").toLowerCase();

      return (originalSearchTitles || []).some(search => {
        const { levels, coreRole } = splitTitleSearch(search);
        const roleWords = coreRole.split(/\s+/).filter(Boolean);

        if (!roleWords.length) return false;

        const hasRoleMeaning = roleWords.every(word => {
          if (ROLE_SYNONYMS[word]) {
            return ROLE_SYNONYMS[word].some(alias => title.includes(alias));
          }
          return title.includes(word);
        });

        const hasLevel = levels.length === 0 || levels.every(level => title.includes(level));

        return hasRoleMeaning && hasLevel;
      });
    }

    console.log("ORIGINAL USER JOB TITLES:", jobData.jobTitle);
    console.log("BEFORE TITLE FILTER:", cleanedCount);

    const strictTitleFilteredCandidates = cleanedLeads.filter(c => strictRoleFilter(c.title, jobData.jobTitle));
    
    let finalCandidates = strictTitleFilteredCandidates;
    let matchTier = "strict";
    let fallbackMatchCount = 0;

    if (finalCandidates.length === 0 && cleanedCount > 0) {
      const fallbackCandidates = cleanedLeads.filter(c =>
        fallbackCoreRoleMatches(c.title, jobData.jobTitle)
      );

      if (fallbackCandidates.length > 0) {
        finalCandidates = fallbackCandidates;
        matchTier = "fallback_core_role";
        fallbackMatchCount = fallbackCandidates.length;
      }
    }

    const afterTitleFilterCount = finalCandidates.length;
    console.log("MATCH TIER:", matchTier);
    console.log("AFTER TITLE FILTER:", afterTitleFilterCount);
    console.log("REJECTED TITLE SAMPLES:", cleanedLeads.filter(c => !strictRoleFilter(c.title, jobData.jobTitle) && !fallbackCoreRoleMatches(c.title, jobData.jobTitle)).slice(0, 10).map(c => c.title));

    const finalMeta = {
      rawCount: apifyMetadata.rawCount,
      realItemsCount: apifyMetadata.realItemsCount,
      cleanedCount: cleanedCount,
      beforeTitleFilter: cleanedCount,
      afterTitleFilter: afterTitleFilterCount,
      matchTier,
      strictMatchCount: strictTitleFilteredCandidates.length,
      fallbackMatchCount,
      rejectedTitleSamples: cleanedLeads.filter(c => !strictRoleFilter(c.title, jobData.jobTitle) && !fallbackCoreRoleMatches(c.title, jobData.jobTitle)).slice(0, 10).map(c => c.title)
    };

    if (cleanedCount > 0 && afterTitleFilterCount === 0) {
      return sendCandidateResponse(res, {
        success: true,
        message: "Leads were found, but none matched the selected job title or related role.",
        candidates: [],
        meta: finalMeta
      });
    }

    // 6. Filter + rank + dedupe, then save using insertMany
    const candidatesToInsert = [];
    const seenEmails = new Set();
    const seenLinkedins = new Set();

    for (const lead of finalCandidates) {
      const ranking = rankCandidate(lead, jobData);
      if (!ranking.passesFilters) continue;
      if ((lead.email && seenEmails.has(lead.email)) || (lead.linkedinUrl && seenLinkedins.has(lead.linkedinUrl))) continue;
      
      if (lead.email) seenEmails.add(lead.email);
      if (lead.linkedinUrl) seenLinkedins.add(lead.linkedinUrl);

      candidatesToInsert.push({
        ...lead,
        jobId,
        contactStatus: "not_contacted",

        matchScore: ranking.score,
        matchLabel: ranking.label,
        rankingReasons: ranking.reasons,
      });
    }

    candidatesToInsert.sort((a, b) => b.matchScore - a.matchScore);

    let savedCandidates = [];
    if (candidatesToInsert.length > 0) {
      savedCandidates = await Candidate.insertMany(candidatesToInsert);
    }

    // 7. Save to Search Cache for global reuse
    if (Array.isArray(savedCandidates) && savedCandidates.length > 0) {
      await SearchCache.findOneAndUpdate(
        { queryHash },
        {
          queryHash,
          normalizedQuery,
          candidates: savedCandidates,
          source: "apify",
          lastApifyRunId: apifyMetadata.lastApifyRunId || null,
          lastDatasetId: apifyMetadata.lastDatasetId || null,
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );

      console.log("SEARCH CACHE SAVED:", {
        queryHash,
        candidatesCount: savedCandidates.length
      });
    } else {
      console.log("SEARCH CACHE NOT SAVED: no final candidates");
    }

    let responseMessage = "Candidates found successfully.";
    if (matchTier === "fallback_core_role") {
      responseMessage = "No exact title matches found. Showing close role matches instead.";
    }

    return sendCandidateResponse(res, {
      success: true,
      message: savedCandidates.length > 0 ? responseMessage : "Leads were found, but none matched the selected job title or related role.",
      candidates: savedCandidates,
      meta: finalMeta
    });
  } catch (error) {
    console.error("FULL recruitment search error:", error?.message || error);
    return sendCandidateResponse(res, {
      success: false,
      message: "An unexpected error occurred during lead sourcing",
      status: 500
    });
  }
});

router.get("/candidates", authenticate, async (req, res) => {
  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "jobId query parameter is required",
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 100), 200);
    const skip = (page - 1) * limit;

    const candidates = await Candidate.find({ jobId })
      .sort({ matchScore: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      data: candidates,
      count: candidates.length,
    });
  } catch (error) {
    console.error("Error fetching candidates:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid jobId format",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch candidates",
    });
  }
});

router.put("/candidates/:id/contacted", authenticate, async (req, res) => {
  try {
    const candidate = await Candidate.findByIdAndUpdate(
      req.params.id,
      { contactStatus: "Contacted" },
      { new: true }
    );
    
    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    return res.status(200).json({ success: true, data: candidate });
  } catch (error) {
    console.error("Error updating candidate:", error);
    return res.status(500).json({ success: false, message: "Failed to update candidate" });
  }
});

router.delete("/candidates/:id", authenticate, async (req, res) => {
  try {
    const candidate = await Candidate.findByIdAndDelete(req.params.id);

    
    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    return res.status(200).json({ success: true, message: "Candidate deleted successfully" });
  } catch (error) {
    console.error("Error deleting candidate:", error);
    return res.status(500).json({ success: false, message: "Failed to delete candidate" });
  }
});

module.exports = router;
