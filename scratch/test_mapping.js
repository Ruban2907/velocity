
const testIndustry = (industry) => {
    let companyKeywordIncludes = [];
    if (industry && Array.isArray(industry)) {
        companyKeywordIncludes = industry.map(ind => 
            ind.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        );
    }
    return companyKeywordIncludes;
};

console.log("Empty:", testIndustry([]));
console.log("Finance:", testIndustry(["finance"]));
console.log("IT:", testIndustry(["information_technology"]));
console.log("Multiple:", testIndustry(["information_technology", "healthcare"]));
console.log("With spaces:", testIndustry(["marketing and advertising"]));
console.log("Null:", testIndustry(null));
console.log("Undefined:", testIndustry(undefined));
