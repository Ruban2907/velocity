const crypto = require("crypto");

/**
 * Normalizes the Apify input to ensure consistent hashing.
 * Lowercases, trims, removes empties, and sorts arrays.
 */
function normalizeCandidateSearchInput(input) {
  if (!input || typeof input !== "object") return {};
  const allowedFields = [

    "personTitleIncludes",
    "personLocationCityIncludes",
    "personLocationCountryIncludes",
    "seniorityIncludes",
    "companyKeywordIncludes",
    "companySizeIncludes",
    "hasEmail",
    "hasPhone"
  ];

  const normalized = {};

  allowedFields.forEach((field) => {
    const value = input[field];

    if (value === undefined || value === null || value === "") return;

    if (Array.isArray(value)) {
      // Filter, trim, lowercase, sort
      const processed = value
        .filter(Boolean)
        .map((v) => String(v).trim().toLowerCase())
        .filter((v) => v !== "")
        .sort();
      
      if (processed.length > 0) {
        normalized[field] = processed;
      }
    } else if (typeof value === "string") {
      const processed = value.trim().toLowerCase();
      if (processed !== "") {
        normalized[field] = processed;
      }
    } else {
      // boolean, numbers, etc.
      normalized[field] = value;
    }
  });

  return normalized;
}

/**
 * Creates a SHA-256 hash from a normalized query object.
 */
function createSearchHash(normalizedQuery) {
  // Sort the keys of the object to ensure JSON.stringify is deterministic
  const sortedKeys = Object.keys(normalizedQuery).sort();
  const sortedObj = {};
  sortedKeys.forEach(key => {
    sortedObj[key] = normalizedQuery[key];
  });

  const queryStr = JSON.stringify(sortedObj);
  return crypto.createHash("sha256").update(queryStr).digest("hex");
}

module.exports = {
  normalizeCandidateSearchInput,
  createSearchHash
};
