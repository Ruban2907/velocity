const { ApifyClient } = require('apify-client');

// Initialize the ApifyClient with API token
const client = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

async function fetchLeadsFromApify(jobData) {
    let personLocationCityIncludes = [];
    let personLocationCountryIncludes = [];

    // Map location into city and country parts based on comma separator
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

    // Normalize company size values for Apify actor
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
            if (mapping[size]) {
                companySizeIncludes.push(...mapping[size]);
            } else {
                companySizeIncludes.push(size);
            }
        });
        companySizeIncludes = [...new Set(companySizeIncludes)];
    }

    // Map industry format
    let companyKeywordIncludes = [];
    if (jobData.industry && Array.isArray(jobData.industry)) {
        companyKeywordIncludes = jobData.industry.map(ind => 
            ind.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        );
    }

    // Convert jobData into Apify JSON input mapping
    const input = {
        personTitleIncludes: jobData.jobTitle || [],
        personLocationCityIncludes,
        personLocationCountryIncludes,
        seniorityIncludes: jobData.seniority || [],
        companyKeywordIncludes,
        companySizeIncludes,
        hasEmail: typeof jobData.emailRequired === "boolean" ? jobData.emailRequired : false,
        totalResults: Math.min(100, Math.max(1, jobData.perPage || 25))
    };

    // Call Apify actor
    const actorId = "pipelinelabs/lead-scraper-apollo-zoominfo-lusha-ppe";
    const run = await client.actor(actorId).call(input);

    // Fetch dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    // Return raw items without cleaning yet
    return items;
}

module.exports = {
    fetchLeadsFromApify
};
