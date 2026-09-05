const { ApifyClient } = require('apify-client');

// Initialize the ApifyClient with API token
const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

const COMMON_TYPOS = {
    "softwaer": "software",
    "enginer": "engineer",
    "backendd": "backend",
    "fronted": "frontend",
    "develope": "developer"
};

const SENIORITY_WORDS = [
    "associate", "senior", "junior", "intern", "entry", 
    "lead", "manager", "director", "principal", "staff"
];

function splitTitleSearch(searchTitle) {
    const words = String(searchTitle || "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

    const levels = words.filter(w => SENIORITY_WORDS.includes(w));
    const roleWords = words.filter(w => !SENIORITY_WORDS.includes(w));

    return {
        levels,
        coreRole: roleWords.join(" ")
    };
}

function buildApifyTitles(jobTitles) {
    const titles = Array.isArray(jobTitles) ? jobTitles : [jobTitles];
    return titles.filter(Boolean).map(title => {
        const { coreRole } = splitTitleSearch(title);
        return coreRole || title;
    });
}

function buildApifyInput(jobData) {
    // 1. Broaden titles for Apify
    const apifyTitles = buildApifyTitles(jobData.jobTitle);

    // 2. Resolve seniority conflicts
    const titleSenioritiesFound = new Set();
    const rawTitles = Array.isArray(jobData.jobTitle) ? jobData.jobTitle : [jobData.jobTitle];
    rawTitles.filter(Boolean).forEach(title => {
        SENIORITY_WORDS.forEach(word => {
            if (String(title).toLowerCase().includes(word)) titleSenioritiesFound.add(word);
        });
    });

    let finalSeniorityIncludes = [];
    if (titleSenioritiesFound.size > 0) {
        finalSeniorityIncludes = (jobData.seniority || []).filter(s => 
            titleSenioritiesFound.has(String(s).toLowerCase())
        );
    } else {
        finalSeniorityIncludes = jobData.seniority || [];
    }

    let personLocationCityIncludes = [];
    let personLocationCountryIncludes = [];

    // Map location into city and country parts
    if (jobData.location && Array.isArray(jobData.location)) {
        const knownCountries = ["pakistan", "india", "united states", "usa", "us", "uk", "united kingdom", "canada", "australia", "germany", "france", "uae"];
        jobData.location.forEach(loc => {
            const parts = loc.split(',').map(p => p.trim());
            if (parts.length > 1) {
                personLocationCityIncludes.push(parts[0]);
                personLocationCountryIncludes.push(parts[parts.length - 1]);
            } else if (parts.length === 1 && parts[0]) {
                if (knownCountries.includes(parts[0].toLowerCase())) {
                    personLocationCountryIncludes.push(parts[0]);
                } else {
                    personLocationCityIncludes.push(parts[0]);
                }
            }
        });
    }

    // Normalize company size values
    let companySizeIncludes = [];
    if (jobData.companySize && Array.isArray(jobData.companySize)) {
        const mapping = {
            "1,10": ["1-10"],
            "11,50": ["11-50"],
            "51,200": ["51-200"],
            "201,500": ["201-500"],
            "501,1000": ["501-1000"],
            "1001,10000": ["1001-5000", "5001-10000", "10001+"]
        };
        jobData.companySize.forEach(size => {
            if (mapping[size]) companySizeIncludes.push(...mapping[size]);
            else companySizeIncludes.push(size);
        });
        companySizeIncludes = [...new Set(companySizeIncludes)];
    }

    const INDUSTRY_KEYWORDS = {
        finance: ["financial services", "fintech", "banking"],
        information_technology: ["software", "technology", "IT services"],
        healthcare: ["healthcare", "medical", "hospital"],
        education: ["education", "e-learning", "edtech"],
        ecommerce: ["ecommerce", "retail", "online store"],
        marketing_and_advertising: ["marketing", "advertising", "digital marketing"],
        manufacturing: ["manufacturing", "industrial", "engineering"],
        management_consulting: ["consulting", "business consulting"]
    };

    const companyKeywordIncludes =
        Array.isArray(jobData.industry)
            ? jobData.industry.flatMap(ind => INDUSTRY_KEYWORDS[ind] || [ind]).filter(Boolean)
            : [];

    return {
        personTitleIncludes: apifyTitles,
        personLocationCityIncludes,
        personLocationCountryIncludes,
        seniorityIncludes: finalSeniorityIncludes,
        companyKeywordIncludes,
        companySizeIncludes,
        hasEmail: typeof jobData.emailRequired === "boolean" ? jobData.emailRequired : false,
        totalResults: Math.min(100, Math.max(1, jobData.perPage || 25)),
        includeTitleVariants: true,
        roleMatchMode: "any",
        companyMatchMode: "any",
        companyKeywordMode: "broad",
        companyDomainMatchMode: "strict",
        resetProgress: true,
        dontSaveProgress: false
    };
}

async function fetchLeadsFromApify(jobData) {
    const token = process.env.APIFY_TOKEN;
    if (!token || token === 'your_apify_token_here' || token.startsWith('your_')) {
        const err = new Error("APIFY_TOKEN is missing or set to placeholder in backend environment. Please configure a valid Apify API token.");
        err.statusCode = 500;
        throw err;
    }


    const input = buildApifyInput(jobData);
    console.log("APIFY INPUT:", JSON.stringify(input, null, 2));

    // Call Apify actor
    const actorId = "pipelinelabs/lead-scraper-apollo-zoominfo-lusha-ppe";
    const run = await client.actor(actorId).call(input);

    console.log("APIFY RUN ID:", run.id, "STATUS:", run.status);
    console.log("APIFY DATASET ID:", run.defaultDatasetId);

    // Fetch dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    console.log("DATASET RAW COUNT:", items.length);

    // Filter out diagnostic rows before returning
    const realItems = items.filter(
        item => item.recordType !== "diagnostic" && item.rowType !== "diagnostic"
    );

    console.log("REAL ITEMS COUNT:", realItems.length);

    // Return items along with metadata counts and IDs
    return {
        items: realItems,
        metadata: {
            rawCount: items.length,
            realItemsCount: realItems.length,
            lastApifyRunId: run.id,
            lastDatasetId: run.defaultDatasetId
        }
    };
}

module.exports = {
    buildApifyInput,
    fetchLeadsFromApify
};
