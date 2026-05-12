import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import AssessmentModal, { AssessmentData } from "@/components/recruitment/AssessmentModal";
import CandidateList from "@/components/recruitment/CandidateList";
import { useToast } from "@/hooks/use-toast";

const seniorityOptions = [
  { label: "C Suite", value: "c_suite" },
  { label: "Director", value: "director" },
  { label: "Manager", value: "manager" },
  { label: "Senior", value: "senior" },
  { label: "Entry", value: "entry" },
  { label: "Owner", value: "owner" },
  { label: "Partner", value: "partner" },
  { label: "Intern", value: "intern" },
];

const industryOptions = [
  { label: "Software / IT", value: "information_technology" },
  { label: "Finance", value: "finance" },
  { label: "Healthcare", value: "healthcare" },
  { label: "Education", value: "education" },
  { label: "E-commerce", value: "ecommerce" },
  { label: "Marketing", value: "marketing_and_advertising" },
  { label: "Manufacturing", value: "mechanical_or_industrial_engineering" },
  { label: "Consulting", value: "management_consulting" },
];

const companySizeOptions = [
  { label: "1-10", value: "1,10" },
  { label: "11-50", value: "11,50" },
  { label: "51-200", value: "51,200" },
  { label: "201-500", value: "201,500" },
  { label: "501-1000", value: "501,1000" },
  { label: "1000+", value: "1001,10000" },
];

const toList = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

interface JobSpecFormProps {
  onSubmit?: (payload: unknown) => void;
}

interface AssessmentRequestPayload {
  jobTitle: string;
  location: string;
  seniority: string[];
  industry: string;
  companySize: string[];
  skills: string;
  keywords: string;
  minExperience: number | null;
  education: string;
  resultsPerPage: number;
}

const JobSpecForm = ({ onSubmit }: JobSpecFormProps) => {
  const { toast } = useToast();
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [seniority, setSeniority] = useState<string[]>([]);
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState<string[]>([]);
  const [skills, setSkills] = useState("");
  const [keywords, setKeywords] = useState("");
  const [minExperienceYears, setMinExperienceYears] = useState<number | "">("");
  const [education, setEducation] = useState("");
  const [emailRequired, setEmailRequired] = useState(false);
  const [perPage, setPerPage] = useState(25);
  const [error, setError] = useState("");
  const [submittingForm, setSubmittingForm] = useState(false);
  const [jobSpecData, setJobSpecData] = useState<AssessmentRequestPayload | null>(null);
  const [assessment, setAssessment] = useState<AssessmentData | null>(null);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [assessmentError, setAssessmentError] = useState("");
  const [savedJob, setSavedJob] = useState<any | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidatesError, setCandidatesError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const toggleSelection = (
    value: string,
    selected: string[],
    setter: (values: string[]) => void,
  ) => {
    setter(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  };

  const generateAssessmentFromPayload = async (payload: AssessmentRequestPayload) => {
    try {
      setAssessmentOpen(true);
      setAssessmentLoading(true);
      setAssessmentError("");
      const response = await api.post("/assessments/generate", payload);
      const generatedAssessment = response?.data?.data;

      setAssessment(generatedAssessment || null);
    } catch (err: any) {
      const message = err?.response?.data?.message || "Failed to generate assessment.";
      setAssessment(null);
      setAssessmentError(message);
      toast({
        title: "Assessment generation failed",
        description: message,
      });
    } finally {
      setAssessmentLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobTitle.trim() || !location.trim()) {
      setError("Job Title and Location are required.");
      return;
    }

    setError("");
    const payload = {
      job_title: toList(jobTitle),
      location: toList(location),
      seniority,
      industry: industry ? [industry] : [],
      company_size: companySize,
      keywords: keywords.trim(),
      email_required: emailRequired,
      per_page: Math.min(100, Math.max(1, Number(perPage) || 25)),
      post_filters: {
        skills: toList(skills),
        min_experience_years: minExperienceYears === "" ? null : Number(minExperienceYears),
        education: education.trim(),
      },
    };

    const assessmentPayload: AssessmentRequestPayload = {
      jobTitle: jobTitle.trim(),
      location: location.trim(),
      seniority,
      industry,
      companySize,
      skills: skills.trim(),
      keywords: keywords.trim(),
      minExperience: minExperienceYears === "" ? null : Number(minExperienceYears),
      education: education.trim(),
      resultsPerPage: Math.min(100, Math.max(1, Number(perPage) || 25)),
    };

    onSubmit?.(payload);
    setJobSpecData(assessmentPayload);
    setAssessment(null);
    setAssessmentError("");

    try {
      setSubmittingForm(true);
      const response = await api.post("/jobs", payload);
      setSavedJob(response.data.data);
      toast({
        title: "Job specification saved",
        description: "Your job specification was successfully saved.",
      });
    } catch (err: any) {
      const message = err?.response?.data?.message || "Failed to save job spec.";
      setError(message);
    } finally {
      setSubmittingForm(false);
    }
  };

  const handleFindCandidates = async () => {
    if (!savedJob || !savedJob._id) return;

    setLoadingCandidates(true);
    setCandidates([]);
    setCandidatesError("");
    setHasSearched(false);

    try {
      const response = await api.post("/recruitment/search", {
        jobId: savedJob._id,
      });
      setCandidates(response.data.data || []);
      toast({
        title: "Candidates found",
        description: `Successfully loaded ${response.data.data?.length || 0} candidates.`,
      });
    } catch (err: any) {
      const message = err?.response?.data?.message || "Candidate sourcing failed. Please try again.";
      setCandidatesError(message);
      toast({
        title: "Candidate sourcing failed",
        description: message,
      });
    } finally {
      setLoadingCandidates(false);
      setHasSearched(true);
    }
  };

  const handleGenerateAssessment = async () => {
    if (!jobSpecData) {
      toast({
        title: "Generate assessment",
        description: "Fill and submit the form first so we can use your latest job specification.",
      });
      return;
    }

    await generateAssessmentFromPayload(jobSpecData);
  };

  const handleSendExam = async (candidateEmail: string, candidateName: string) => {
    if (!assessment?._id) {
      toast({
        title: "Assessment not ready",
        description: "Generate an assessment first before sending.",
      });
      return null;
    }

    try {
      const response = await api.post("/assessments/send", {
        assessmentId: assessment._id,
        candidateEmail,
        candidateName,
      });

      return response?.data?.data?.examLink || null;
    } catch (err: any) {
      const message = err?.response?.data?.message || "Failed to send assessment email.";
      toast({
        title: "Email delivery failed",
        description: message,
      });
      return null;
    }
  };

  const handleCreateExamLink = async (candidateEmail: string, candidateName: string) => {
    if (!assessment?._id) {
      toast({
        title: "Assessment not ready",
        description: "Generate an assessment first before creating a link.",
      });
      return null;
    }

    try {
      const response = await api.post("/assessments/link", {
        assessmentId: assessment._id,
        candidateEmail,
        candidateName,
      });

      return response?.data?.data?.examLink || null;
    } catch (err: any) {
      const message = err?.response?.data?.message || "Failed to create exam link.";
      toast({
        title: "Link creation failed",
        description: message,
      });
      return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="jobTitle">Job Title (comma-separated)</Label>
          <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Senior Backend Engineer" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Location (comma-separated)</Label>
          <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lahore, Pakistan" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Seniority</Label>
        <div className="flex flex-wrap gap-2">
          {seniorityOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={seniority.includes(option.value) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleSelection(option.value, seniority, setSeniority)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <select
            id="industry"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          >
            <option value="">Select industry</option>
            {industryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Company Size</Label>
          <div className="flex flex-wrap gap-2">
            {companySizeOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={companySize.includes(option.value) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleSelection(option.value, companySize, setCompanySize)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="skills">Required Skills (comma-separated)</Label>
          <Input id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Node.js, Python, MongoDB" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="keywords">Keywords / Certifications</Label>
          <Input id="keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="AWS certified PMP" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="experience">Minimum Experience (Years)</Label>
          <Input
            id="experience"
            type="number"
            min={0}
            value={minExperienceYears}
            onChange={(e) => setMinExperienceYears(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="education">Education</Label>
          <Input id="education" value={education} onChange={(e) => setEducation(e.target.value)} placeholder="Bachelor's in CS" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="perPage">Results per page</Label>
          <Input id="perPage" type="number" min={1} max={100} value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} />
        </div>
      </div>

      <div className="flex items-center justify-between border rounded-md px-3 py-2">
        <span className="text-sm font-medium">Email Required?</span>
        <Button type="button" size="sm" variant={emailRequired ? "default" : "outline"} onClick={() => setEmailRequired((prev) => !prev)}>
          {emailRequired ? "Yes" : "No"}
        </Button>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="flex justify-end gap-2">
        {savedJob ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleFindCandidates}
              disabled={loadingCandidates}
            >
              {loadingCandidates ? "Finding candidates..." : "Find Candidates"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleGenerateAssessment}
              disabled={assessmentLoading}
            >
              {assessmentLoading ? "Generating..." : "Generate MCQ Assessment"}
            </Button>
          </>
        ) : null}
        <Button type="submit" disabled={submittingForm}>
          {submittingForm ? "Saving..." : "Save Job Specification"}
        </Button>
      </div>

      {candidatesError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {candidatesError}
        </div>
      ) : null}

      {loadingCandidates && (
        <div className="rounded-md border bg-muted/20 px-4 py-6 text-center text-sm font-medium text-muted-foreground animate-pulse">
          Finding candidates... This can take up to 60 seconds depending on criteria.
        </div>
      )}

      {candidates.length > 0 && !loadingCandidates ? (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Found {candidates.length} Candidates</h2>
          <CandidateList candidates={candidates} />
        </div>
      ) : null}

      {savedJob && candidates.length === 0 && !loadingCandidates && !candidatesError && hasSearched ? (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
          No candidates found. Try broader filters.
        </div>
      ) : null}

      {savedJob && candidates.length === 0 && !loadingCandidates && !candidatesError && !hasSearched ? (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Job specification saved. You can now find candidates or generate the exam directly.
        </div>
      ) : null}

      <AssessmentModal
        open={assessmentOpen}
        onOpenChange={setAssessmentOpen}
        assessment={assessment}
        loading={assessmentLoading}
        error={assessmentError}
        onRetry={handleGenerateAssessment}
        onSendExam={handleSendExam}
        onCreateExamLink={handleCreateExamLink}
      />
    </form>
  );
};

export default JobSpecForm;
