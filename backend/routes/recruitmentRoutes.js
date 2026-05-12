const express = require("express");
const { fetchLeadsFromApify } = require("../services/apifyLeadService");
const JobSpec = require("../model/JobSpec");
const Candidate = require("../model/Candidate");

const router = express.Router();

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

  const passesSkillFilter = !skillTokens.length || skillsMatched;
  const passesEmailFilter = !needsEmail || Boolean(email);
  const passesFilters = passesSkillFilter && passesEmailFilter;

  return {
    score: Math.max(0, Math.min(100, score)),
    label: deriveMatchLabel(score),
    reasons,
    passesFilters,
  };
};

router.post("/search", async (req, res) => {
  try {
    const { jobId } = req.body || {};

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "jobId is required",
      });
    }

    const jobData = await JobSpec.findById(jobId);
    if (!jobData) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
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

      return res.status(200).json({
        success: true,
        data: rankedExisting,
      });
    }

    // 4. B. Call Apify
    let rawLeads;
    try {
      rawLeads = await fetchLeadsFromApify(jobData);
    } catch (apifyError) {
      console.error("Apify execution error:", apifyError);
      return res.status(500).json({
        success: false,
        message: apifyError?.message || "Lead sourcing failed",
      });
    }

    if (!rawLeads || rawLeads.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No candidates found",
        data: []
      });
    }

      // 4. C. Clean leads
    const cleanedLeads = [];
    for (const lead of rawLeads) {
      if (lead.rowType === "diagnostic") continue;

      let nameStr = lead.fullName || "";
      if (!nameStr && (lead.firstName || lead.lastName)) {
        nameStr = `${lead.firstName || ""} ${lead.lastName || ""}`.trim();
      }

      let locationStr = "";
      if (lead.personCity || lead.personCountry) {
        locationStr = `${lead.personCity || ""} ${lead.personCountry || ""}`.trim();
      }

      let linkedinStr = lead.linkedinUrl || "";
      if (linkedinStr && !linkedinStr.startsWith("http")) {
        linkedinStr = "https://" + linkedinStr.replace(/^\/*/, "");
      }

      // Check validity per user rules
      const isValid = (val) => {
        if (!val) return false;
        if (typeof val === "string") {
          const t = val.trim();
          return t !== "" && t.toLowerCase() !== "n/a";
        }
        return true;
      };

      if (!isValid(nameStr) && !isValid(lead.title) && !isValid(linkedinStr) && !isValid(lead.email) && !isValid(lead.companyName)) {
        continue; // eject bad row
      }

      const arrayToString = (val) => {
        if (val === undefined || val === null) return "";
        if (Array.isArray(val)) return val.join(", ").trim();
        const str = String(val).trim();
        return str.toLowerCase() === "n/a" ? "" : str;
      };

      cleanedLeads.push({
        name: arrayToString(nameStr),
        title: arrayToString(lead.title),
        seniority: arrayToString(lead.seniority),
        email: arrayToString(lead.email),
        emailStatus: arrayToString(lead.emailStatus),
        phone: arrayToString(lead.phone),
        linkedinUrl: arrayToString(linkedinStr),
        location: arrayToString(locationStr),
        companyName: arrayToString(lead.companyName),
        companyDomain: arrayToString(lead.companyDomain),
        companyIndustry: arrayToString(lead.companyIndustry),
        companySize: arrayToString(lead.companySize)
      });
    }

    if (rawLeads.length > 0 && cleanedLeads.length === 0) {
      console.log("jobId:", jobId);
      console.log("raw leads count:", rawLeads?.length);
      console.log("raw leads first item:", JSON.stringify(rawLeads?.[0], null, 2));
      console.log("cleaned leads count:", cleanedLeads?.length);
      console.log("cleaned leads first item:", JSON.stringify(cleanedLeads?.[0], null, 2));
      console.log("saved candidates count:", 0);

      return res.status(400).json({
        success: false,
        message: "Leads were found but none passed cleaning. Check cleaner rules."
      });
    }

    // 5. Filter + rank + dedupe, then save using insertMany
    const candidatesToInsert = [];
    const seenEmails = new Set();
    const seenLinkedins = new Set();

    for (const lead of cleanedLeads) {
      const ranking = rankCandidate(lead, jobData);
      if (!ranking.passesFilters) continue;

      let isDuplicate = false;
      if (lead.email && seenEmails.has(lead.email)) isDuplicate = true;
      if (lead.linkedinUrl && seenLinkedins.has(lead.linkedinUrl)) isDuplicate = true;

      // Skip saving if duplicate found
      if (isDuplicate) continue;

      if (lead.email) seenEmails.add(lead.email);
      if (lead.linkedinUrl) seenLinkedins.add(lead.linkedinUrl);

      candidatesToInsert.push({
        ...lead,
        jobId,
        contactStatus: "Not Contacted",
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

    if (savedCandidates.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Invalid or No Matching Candidates.",
        data: [],
      });
    }

    console.log("jobId:", jobId);
    console.log("raw leads count:", rawLeads?.length);
    console.log("raw leads first item:", JSON.stringify(rawLeads?.[0], null, 2));
    console.log("cleaned leads count:", cleanedLeads?.length);
    console.log("cleaned leads first item:", JSON.stringify(cleanedLeads?.[0], null, 2));
    console.log("saved candidates count:", savedCandidates?.length);

    // 6. Return response mapped explicitly
    return res.status(200).json({
      success: true,
      data: savedCandidates,
    });

  } catch (error) {
    console.error("FULL recruitment search error:", error);
    console.error("error stack:", error?.stack);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during lead sourcing",
    });
  }
});

router.get("/candidates", async (req, res) => {
  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "jobId query parameter is required",
      });
    }

    const candidates = await Candidate.find({ jobId }).sort({ matchScore: -1, createdAt: -1 });

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

router.put("/candidates/:id/contacted", async (req, res) => {
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

router.delete("/candidates/:id", async (req, res) => {
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
