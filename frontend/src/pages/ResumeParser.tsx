import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { UploadCloud, FileText, Loader2, Download } from "lucide-react";
import api from "@/lib/api";


const positionOptions = [
  "Software Engineer",
  "Data Scientist",
  "Product Manager",
  "Designer",
  "Sales",
];

type ParsedResult = Record<string, unknown> | null;

const ResumeParser = () => {
  const [file, setFile] = useState<File | null>(null);
  const [position, setPosition] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedResult>(null);

  const downloadResult = () => {
    if (!result) return;
    const filename = (file?.name || "resume").replace(/\.[^.]+$/, "");
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}-parsed.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const insights = (result as any)?.insights || null;

  const toBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] || "";
        resolve(base64);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const handleSubmit = async () => {
    setError(null);
    setResult(null);

    if (!file) {
      setError("Please upload a resume (PDF or DOCX).");
      return;
    }

    if (!position.trim()) {
      setError("Please select a position.");
      return;
    }

    if (!description.trim()) {
      setError("Please paste a job description. It’s required for accurate matching.");
      return;
    }

    setLoading(true);
    try {
      const documentBase64 = await toBase64(file);
      const response = await api.post("/resume/parse", {
        documentBase64,
        fileName: file.name,
        position,
        description,
      });

      setResult(response.data?.data || response.data);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || err?.message || "Something went wrong";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }

  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Upload Resume</h1>
          <p className="text-muted-foreground mt-1">
            Upload a candidate resume and test the parsing pipeline.
          </p>
        </div>

        <Card className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-card/70">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Job Description</h2>
              <p className="text-sm text-muted-foreground">
                Add context to improve downstream matching.
              </p>
            </div>

            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select Position" />
              </SelectTrigger>
              <SelectContent>
                {positionOptions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <Textarea
                placeholder="Paste the job description here (required for accurate matching)"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full lg:w-auto"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing...
                </div>
              ) : (
                "Submit"
              )}
            </Button>

            {error && (
              <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md p-3">
                {error}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center justify-center text-center bg-muted/30">
              <div className="p-4 bg-primary/10 rounded-full mb-3">
                <UploadCloud className="h-8 w-8 text-primary" />
              </div>
              <p className="font-semibold text-foreground">Drag or upload resume</p>
              <p className="text-sm text-muted-foreground mb-4">PDF or DOCX up to ~5MB</p>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file && (
                <div className="flex items-center gap-2 mt-3 text-sm text-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{file.name}</span>
                </div>
              )}
            </div>
          </div>
        </Card>

        {result && (
          <Card className="p-4 bg-card border-border">
            {insights ? (
              <div className="space-y-6 mb-4">
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card className="p-4 bg-background border-border">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold text-foreground">Profile Card</h3>
                    </div>

                    <p className="text-sm font-semibold text-foreground">
                      {insights.profileCard?.name || "Candidate"}
                    </p>

                    {insights.profileCard?.contact ? (
                      <div className="text-sm text-muted-foreground space-y-1 mt-2">
                        {insights.profileCard.contact.email ? <div>Email: {insights.profileCard.contact.email}</div> : null}
                        {insights.profileCard.contact.phone ? <div>Phone: {insights.profileCard.contact.phone}</div> : null}
                        {insights.profileCard.contact.linkedin ? (
                          <div>
                            LinkedIn:{" "}
                            <a
                              className="underline"
                              href={`https://${insights.profileCard.contact.linkedin}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {insights.profileCard.contact.linkedin}
                            </a>
                          </div>
                        ) : null}
                        {insights.profileCard.contact.github ? (
                          <div>
                            GitHub:{" "}
                            <a
                              className="underline"
                              href={`https://${insights.profileCard.contact.github}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {insights.profileCard.contact.github}
                            </a>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <div className="text-sm font-semibold text-foreground mb-2">Top Skills</div>
                      <div className="flex flex-wrap gap-2">
                        {(insights.profileCard?.topSkills || []).slice(0, 10).map((s: string, idx: number) => (
                          <span key={`${s}-${idx}`} className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                            {s}
                          </span>
                        ))}
                        {!insights.profileCard?.topSkills?.length ? (
                          <span className="text-sm text-muted-foreground">No skills extracted.</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-semibold text-foreground mb-2">Education</div>
                      <div className="space-y-2">
                        {(insights.profileCard?.education || []).slice(0, 2).map((e: any, idx: number) => (
                          <div key={idx} className="text-sm text-muted-foreground">
                            <div className="font-medium text-foreground">{e.degree || "Education"}</div>
                            <div>{e.institution || ""} {e.years ? `(${e.years})` : ""}</div>
                          </div>
                        ))}
                        {!insights.profileCard?.education?.length ? (
                          <div className="text-sm text-muted-foreground">No education found.</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-semibold text-foreground mb-2">Experience</div>
                      <div className="space-y-2">
                        {(insights.profileCard?.experience || []).slice(0, 2).map((x: any, idx: number) => (
                          <div key={idx} className="text-sm text-muted-foreground">
                            <div className="font-medium text-foreground">
                              {x.role || "Role"} {x.company ? `- ${x.company}` : ""}
                            </div>
                            <div>{x.duration ? x.duration : ""} {x.location ? `• ${x.location}` : ""}</div>
                          </div>
                        ))}
                        {!insights.profileCard?.experience?.length ? (
                          <div className="text-sm text-muted-foreground">No experience found.</div>
                        ) : null}
                      </div>
                    </div>
                  </Card>

                  <Card className="p-4 bg-background border-border">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold text-foreground">Job Match Score</h3>
                    </div>

                    <div className="text-sm text-muted-foreground mb-3">
                      {insights.jobMatchScore?.label ? insights.jobMatchScore.label : "Match score"}
                    </div>

                    <div className="text-3xl font-bold text-foreground">
                      {typeof insights.jobMatchScore?.score === "number" ? `${insights.jobMatchScore.score}%` : "--"}
                    </div>

                    <div className="mt-2">
                      <Progress value={insights.jobMatchScore?.score || 0} />
                    </div>

                    <div className="text-xs text-muted-foreground mt-2">
                      Estimated from resume text vs your provided job description.
                    </div>
                  </Card>
                </div>

                <Card className="p-4 bg-background border-border">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-lg font-semibold text-foreground">Skill Gap Analysis</h3>
                    <div className="text-sm text-muted-foreground">
                      Required: {insights.skillGapAnalysis?.requiredSkills?.length || 0} • Missing:{" "}
                      {insights.skillGapAnalysis?.missingSkills?.length || 0}
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <div className="text-sm font-semibold text-foreground mb-2">Present Skills</div>
                      <div className="flex flex-wrap gap-2">
                        {(insights.skillGapAnalysis?.presentSkills || []).slice(0, 12).map((s: string, idx: number) => (
                          <span key={`${s}-${idx}`} className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                            {s}
                          </span>
                        ))}
                        {!insights.skillGapAnalysis?.presentSkills?.length ? (
                          <span className="text-sm text-muted-foreground">None detected.</span>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-foreground mb-2">Missing Skills</div>
                      <div className="flex flex-wrap gap-2">
                        {(insights.skillGapAnalysis?.missingSkills || []).slice(0, 12).map((s: string, idx: number) => (
                          <span key={`${s}-${idx}`} className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive">
                            {s}
                          </span>
                        ))}
                        {!insights.skillGapAnalysis?.missingSkills?.length ? (
                          <span className="text-sm text-muted-foreground">None detected.</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-background border-border">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold text-foreground">AI Narrative Summary</h3>
                  </div>

                  {insights.aiNarrativeSummary ? (
                    <p className="text-sm text-muted-foreground whitespace-pre-line">
                      {insights.aiNarrativeSummary}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      AI summary could not be generated for this resume. The rest of the insights are still available.
                    </p>
                  )}
                </Card>
              </div>
            ) : null}

            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Parsed Result</h3>
            </div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">Preview (JSON)</p>
              <Button variant="outline" size="sm" onClick={downloadResult} className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                Download JSON
              </Button>
            </div>
            <pre className="text-sm text-foreground bg-muted/50 rounded-lg p-3 overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ResumeParser;

