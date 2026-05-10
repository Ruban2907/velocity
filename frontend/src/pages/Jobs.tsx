import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemo, useState, useEffect } from "react";
import {
  Briefcase,
  CalendarClock,
  ExternalLink,
  FileText,
  LayoutGrid,
  ListChecks,
  Loader2,
  MapPin,
  Plus,
  Search,
  Settings,
  Trash2,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import JobSpecForm from "@/components/recruitment/JobSpecForm";

const Jobs = () => {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [statusTab, setStatusTab] = useState<"all" | "Active" | "Draft">("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "applicants_desc" | "title_asc">("newest");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<any>(null);
  const [detailCandidates, setDetailCandidates] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageJob, setManageJob] = useState<any>(null);
  const [manageCandidates, setManageCandidates] = useState<any[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        setLoadingJobs(true);
        const response = await api.get("/jobs");
        setJobs(response.data.data || []);
      } catch (err: any) {
        toast({
          title: "Error",
          description: "Failed to load jobs",
        });
      } finally {
        setLoadingJobs(false);
      }
    };
    fetchJobs();
  }, [toast]);

  const processedJobs = useMemo(() => {
    return jobs.map(j => ({
      ...j,
      id: j._id,
      title: j.jobTitle?.join(", ") || "Untitled",
      location: j.location?.join(", ") || "No location",
      type: "Full-time", // Dummy type for layout
      status: "Active",
      applicants: j.candidateCount || 0,
      posted: new Date(j.createdAt).toLocaleDateString(),
      postedDaysAgo: Math.floor((new Date().getTime() - new Date(j.createdAt).getTime()) / (1000 * 3600 * 24)),
      searchableString: `${j.jobTitle?.join(" ")} ${j.location?.join(" ")} ${j.industry?.join(" ")} ${j.seniority?.join(" ")}`.toLowerCase()
    }));
  }, [jobs]);

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return processedJobs.find((j) => j.id === selectedJobId) || null;
  }, [processedJobs, selectedJobId]);

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();

    const withStatus =
      statusTab === "all" ? processedJobs : processedJobs.filter((job) => job.status === statusTab);

    const withQuery =
      q.length === 0
        ? withStatus
        : withStatus.filter((job) => job.searchableString.includes(q));

    const sorted = [...withQuery].sort((a, b) => {
      if (sortBy === "newest") return a.postedDaysAgo - b.postedDaysAgo;
      if (sortBy === "applicants_desc") return b.applicants - a.applicants;
      return a.title.localeCompare(b.title);
    });

    return sorted;
  }, [processedJobs, query, sortBy, statusTab]);

  const openDetails = async (jobId: string) => {
    setSelectedJobId(jobId);
    setDetailsOpen(true);
    setDetailLoading(true);
    setDetailJob(null);
    setDetailCandidates([]);
    try {
      const [jobRes, candidatesRes] = await Promise.all([
        api.get(`/jobs/${jobId}`),
        api.get("/recruitment/candidates", { params: { jobId } }),
      ]);
      setDetailJob(jobRes.data.data || null);
      setDetailCandidates(candidatesRes.data.data || []);
    } catch {
      toast({ title: "Error", description: "Failed to load job details." });
    } finally {
      setDetailLoading(false);
    }
  };

  const openManage = async (jobId: string) => {
    setSelectedJobId(jobId);
    setManageOpen(true);
    setManageLoading(true);
    setManageJob(null);
    setManageCandidates([]);
    try {
      const [jobRes, candidatesRes] = await Promise.all([
        api.get(`/jobs/${jobId}`),
        api.get("/recruitment/candidates", { params: { jobId } }),
      ]);
      setManageJob(jobRes.data.data || null);
      setManageCandidates(candidatesRes.data.data || []);
    } catch {
      toast({ title: "Error", description: "Failed to load management data." });
    } finally {
      setManageLoading(false);
    }
  };

  const handleContactCandidate = async (candidateId: string) => {
    try {
      setActionLoading(`contact-${candidateId}`);
      await api.put(`/recruitment/candidates/${candidateId}/contacted`);
      setManageCandidates(prev => 
        prev.map(c => c._id === candidateId ? { ...c, contactStatus: "Contacted" } : c)
      );
      toast({ title: "Status Updated", description: "Candidate marked as contacted." });
    } catch (err) {
      console.error("Contact error:", err);
      toast({ title: "Update Failed", description: "Could not update candidate status.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCandidate = async (candidateId: string) => {
    try {
      setActionLoading(`delete-${candidateId}`);
      await api.delete(`/recruitment/candidates/${candidateId}`);
      
      // Update manage list
      setManageCandidates(prev => prev.filter(c => c._id !== candidateId));
      
      // Update main jobs list candidate count
      setJobs(prev => prev.map(job => {
        if (job._id === selectedJobId) {
          return { ...job, candidateCount: (job.candidateCount || 1) - 1 };
        }
        return job;
      }));

      toast({ title: "Candidate Removed", description: "Candidate has been deleted from this job." });
    } catch (err) {
      console.error("Delete candidate error:", err);
      toast({ title: "Delete Failed", description: "Failed to remove candidate.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    // For Phase 3 verification, we'll skip native confirm if requested or use a simpler check
    // In a real app we'd use a custom Dialog confirmation
    try {
      setActionLoading(`delete-job-${jobId}`);
      await api.delete(`/jobs/${jobId}`);
      
      // Update local list
      setJobs(prev => prev.filter(j => j._id !== jobId));
      setManageOpen(false);
      
      toast({ 
        title: "Job Specification Deleted", 
        description: "The specification and all linked candidates have been removed." 
      });
    } catch (err) {
      console.error("Delete job error:", err);
      toast({ title: "Error", description: "Failed to delete job specification.", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const applicantPercent = (count: number) => {
    // Convert applicant count to a "momentum" percentage for the progress UI.
    // 50 applicants == 100% (tweakable visual scale).
    return Math.min(100, Math.round((count / 50) * 100));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(20,184,166,0.14),transparent_40%)]" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">Job Postings</h1>
              <p className="text-muted-foreground">
                Search, review, and manage your recruitment job specifications.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center rounded-lg border bg-background/60 px-1 py-1">
                <Button
                  variant={view === "cards" ? "default" : "ghost"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setView("cards")}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Cards
                </Button>
                <Button
                  variant={view === "table" ? "default" : "ghost"}
                  size="sm"
                  className="gap-2"
                  onClick={() => setView("table")}
                >
                  <ListChecks className="h-4 w-4" />
                  Table
                </Button>
              </div>

              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-primary hover:bg-primary/90 gap-2">
                    <Plus className="h-4 w-4" />
                    Create Job
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Job Specification</DialogTitle>
                    <DialogDescription>
                      Fill the form to generate and manage assessments for the role.
                    </DialogDescription>
                  </DialogHeader>
                  <JobSpecForm />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Controls */}
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-5 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by job title, location, or type..."
                className="pl-10"
              />
            </div>

            <div className="md:col-span-3">
              <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="Active">Active</TabsTrigger>
                  <TabsTrigger value="Draft">Draft</TabsTrigger>
                </TabsList>
                <TabsContent value={statusTab} />
              </Tabs>
            </div>

            <div className="md:col-span-3">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="applicants_desc">Most applicants</SelectItem>
                  <SelectItem value="title_asc">Title A-Z</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-1 flex justify-end sm:hidden">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setView((prev) => (prev === "cards" ? "table" : "cards"))}
                aria-label="Toggle view"
              >
                {view === "cards" ? <LayoutGrid className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>

        {/* Jobs */}
        {loadingJobs ? (
          <Card className="p-10 text-center animate-pulse">
            <p className="text-muted-foreground">Loading job specifications...</p>
          </Card>
        ) : view === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredJobs.length === 0 ? (
              <Card className="p-10 text-center">
                <p className="text-muted-foreground">{jobs.length === 0 ? "No job specifications found yet." : "No jobs match your search."}</p>
              </Card>
            ) : null}

            {filteredJobs.map((job) => (
              <Card
                key={job.id}
                className="p-6 hover:shadow-lg transition-all duration-300 relative overflow-hidden"
              >
                <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-primary/10 blur-[2px]" />

                <div className="relative space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-primary/10 rounded-lg">
                        <Briefcase className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-foreground mb-1">{job.title}</h3>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {job.location}
                          </span>
                          <span className="flex items-center gap-1">
                            <CalendarClock className="h-4 w-4" />
                            {job.posted}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Badge
                      className={
                        job.status === "Active"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {job.status}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{job.type}</Badge>
                    <span className="text-muted-foreground">{job.applicants} applicants</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Applicant momentum</span>
                      <span className="font-medium text-foreground">{job.applicants} applicants</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-300"
                        style={{ width: `${applicantPercent(job.applicants)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openDetails(job.id)}
                    >
                      View Details
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => openManage(job.id)}
                    >
                      Manage
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Job</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Location</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Posted</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Applicants</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredJobs.length === 0 ? (
                    <tr>
                      <td className="px-6 py-10 text-center text-muted-foreground" colSpan={6}>
                        {jobs.length === 0 ? "No job specifications found yet." : "No jobs match your search."}
                      </td>
                    </tr>
                  ) : null}

                  {filteredJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 text-foreground font-medium">{job.title}</td>
                      <td className="px-6 py-4 text-muted-foreground">{job.location}</td>
                      <td className="px-6 py-4">
                        <Badge
                          className={
                            job.status === "Active"
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{job.posted}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-primary font-semibold">{job.applicants}</span>
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${applicantPercent(job.applicants)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDetails(job.id)}
                          >
                            View
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openManage(job.id)}
                          >
                            Manage
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Details Dialog — Read-only view */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-y-auto scrollbar-thin">
            <div className="sticky top-0 z-20 p-6 pb-4 border-b bg-background shadow-sm">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                  <Briefcase className="h-6 w-6 text-primary" />
                  {detailJob?.jobTitle?.join(", ") || selectedJob?.title || "Job Details"}
                </DialogTitle>
                <DialogDescription className="text-base">
                  {detailJob
                    ? `${detailJob.location?.join(", ")} • ${detailJob.candidateCount ?? 0} candidates saved`
                    : "Loading job details..."}
                </DialogDescription>
              </DialogHeader>
            </div>

            <div className="flex-1 p-6 pr-8">
              {detailLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground font-medium">Fetching job specification...</p>
                  </div>
                ) : detailJob ? (
                  <div className="space-y-10 pb-6">
                    {/* Job Specification section */}
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="flex items-center gap-2 mb-6">
                        <div className="h-8 w-1 bg-primary rounded-full" />
                        <h3 className="text-lg font-bold tracking-tight flex items-center gap-2 text-foreground">
                          <FileText className="h-5 w-5 text-primary" />
                          Job Specification
                        </h3>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                          { label: "Job Title", value: detailJob.jobTitle?.join(", ") },
                          { label: "Location", value: detailJob.location?.join(", ") },
                          { label: "Seniority", value: detailJob.seniority?.join(", ") },
                          { label: "Industry", value: detailJob.industry?.join(", ") },
                          { label: "Company Size", value: detailJob.companySize?.join(", ") },
                          { label: "Skills", value: detailJob.postFilters?.skills?.join(", ") },
                          { label: "Keywords", value: detailJob.keywords },
                          { label: "Experience", value: detailJob.postFilters?.minExperienceYears != null ? `${detailJob.postFilters.minExperienceYears} years` : undefined },
                          { label: "Education", value: detailJob.postFilters?.education },
                          { label: "Email Required", value: detailJob.emailRequired ? "Yes" : "No" },
                          { label: "Results Count", value: detailJob.perPage?.toString() },
                          { label: "Created Date", value: detailJob.createdAt ? new Date(detailJob.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : undefined },
                        ].map((f) => (
                          <div key={f.label} className="group p-4 rounded-xl border bg-card hover:bg-muted/5 transition-all duration-200 shadow-sm hover:shadow-md">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5 group-hover:text-primary transition-colors">{f.label}</p>
                            <p className="text-sm font-semibold text-foreground break-words leading-relaxed">
                              {f.value || <span className="text-muted-foreground font-normal italic">Not specified</span>}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Candidates section */}
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-1 bg-primary rounded-full" />
                          <h3 className="text-lg font-bold tracking-tight flex items-center gap-2 text-foreground">
                            <Users className="h-5 w-5 text-primary" />
                            Candidates
                          </h3>
                        </div>
                        {detailCandidates.length > 0 && (
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-bold px-3 py-1">
                            {detailCandidates.length} Found
                          </Badge>
                        )}
                      </div>

                      {detailCandidates.length > 0 ? (
                        <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-muted/50 border-b">
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Name</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Title</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Email</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">LinkedIn</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Location</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Company</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {detailCandidates.map((c: any, idx: number) => (
                                  <tr key={c._id || idx} className="hover:bg-muted/20 transition-all duration-150 group">
                                    <td className="px-6 py-4 font-bold text-foreground group-hover:text-primary transition-colors">{c.name}</td>
                                    <td className="px-6 py-4">
                                      <div className="max-w-[200px] truncate font-medium text-muted-foreground group-hover:text-foreground transition-colors" title={c.title}>
                                        {c.title}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      {c.email && c.email !== "N/A" ? (
                                        <a href={`mailto:${c.email}`} className="text-primary hover:underline font-medium flex items-center gap-1.5 transition-all">
                                          {c.email}
                                        </a>
                                      ) : (
                                        <span className="text-muted-foreground/60 italic text-xs">N/A</span>
                                      )}
                                    </td>
                                    <td className="px-6 py-4">
                                      {c.linkedinUrl && c.linkedinUrl !== "N/A" ? (
                                        <a 
                                          href={c.linkedinUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer" 
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/5 text-primary hover:bg-primary/10 transition-all font-medium text-xs"
                                        >
                                          <ExternalLink className="h-3 w-3" /> Profile
                                        </a>
                                      ) : (
                                        <span className="text-muted-foreground/60 text-xs">N/A</span>
                                      )}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-muted-foreground group-hover:text-foreground transition-colors">{c.location}</td>
                                    <td className="px-6 py-4">
                                      <div className="max-w-[150px] truncate font-medium text-muted-foreground group-hover:text-foreground transition-colors" title={c.companyName}>
                                        {c.companyName}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <Badge 
                                        variant={c.contactStatus === "Contacted" ? "default" : "secondary"} 
                                        className={`font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                          c.contactStatus === "Contacted" ? 'bg-primary/20 text-primary hover:bg-primary/30 border-none' : 'bg-muted text-muted-foreground border-none'
                                        }`}
                                      >
                                        {c.contactStatus || "Not Contacted"}
                                      </Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-muted-foreground/20 p-12 text-center bg-muted/5 group">
                          <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                            <Users className="h-8 w-8 text-muted-foreground/50" />
                          </div>
                          <p className="text-base font-bold text-foreground">No candidates yet</p>
                          <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                            This job specification hasn't been used to source candidates yet. Use the <span className="font-bold text-primary">Manage</span> action to find talent.
                          </p>
                        </div>
                      )}
                    </section>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground font-medium">Waiting for job data...</p>
                  </div>
                )}
              </div>
          </DialogContent>
        </Dialog>

        {/* Manage Dialog — Action view */}
        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-y-auto scrollbar-thin">
            <div className="sticky top-0 z-20 p-6 pb-4 border-b bg-background shadow-sm">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                      <Settings className="h-6 w-6 text-primary" />
                      Manage: {manageJob?.jobTitle?.join(", ") || "Job Specification"}
                    </DialogTitle>
                    <DialogDescription className="text-base">
                      Review candidates, generate assessments, or delete this specification.
                    </DialogDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="outline" 
                      className="gap-2 border-primary/20 hover:bg-primary/5"
                      onClick={() => toast({ title: "Generate Quiz", description: "Assessment module integration coming soon." })}
                    >
                      <Zap className="h-4 w-4 text-primary" />
                      Generate Quiz
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="gap-2"
                      onClick={() => handleDeleteJob(selectedJobId!)}
                      disabled={actionLoading === `delete-job-${selectedJobId}`}
                    >
                      {actionLoading === `delete-job-${selectedJobId}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Delete Job
                    </Button>
                  </div>
                </div>
              </DialogHeader>
            </div>

            <div className="flex-1 p-6 pr-8">
              {manageLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground font-medium">Loading candidate data...</p>
                  </div>
                ) : (
                  <div className="space-y-8 pb-6">
                    {/* Candidate Management section */}
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-1 bg-primary rounded-full" />
                          <h3 className="text-lg font-bold tracking-tight flex items-center gap-2 text-foreground">
                            <Users className="h-5 w-5 text-primary" />
                            Candidate Management
                          </h3>
                        </div>
                        {manageCandidates.length > 0 && (
                          <Badge className="bg-primary/10 text-primary font-bold px-3 py-1">
                            {manageCandidates.length} Saved Candidates
                          </Badge>
                        )}
                      </div>

                      {manageCandidates.length > 0 ? (
                        <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[800px]">
                              <thead>
                                <tr className="bg-muted/50 border-b">
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Name</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Title</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Contact Info</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Location</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Company</th>
                                  <th className="px-6 py-4 text-left font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Status</th>
                                  <th className="px-6 py-4 text-right font-bold text-muted-foreground uppercase tracking-wider text-[10px]">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {manageCandidates.map((c: any, idx: number) => (
                                  <tr key={c._id || idx} className="hover:bg-muted/10 transition-all duration-150 group">
                                    <td className="px-6 py-4">
                                      <div className="font-bold text-foreground group-hover:text-primary transition-colors">{c.name}</div>
                                      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">{c.seniority || 'N/A'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="max-w-[180px] truncate font-medium text-muted-foreground group-hover:text-foreground transition-colors" title={c.title}>
                                        {c.title}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="flex flex-col gap-1">
                                        {c.email && c.email !== "N/A" ? (
                                          <a href={`mailto:${c.email}`} className="text-primary hover:underline font-medium text-xs">
                                            {c.email}
                                          </a>
                                        ) : (
                                          <span className="text-muted-foreground/60 italic text-xs">No Email</span>
                                        )}
                                        {c.linkedinUrl && c.linkedinUrl !== "N/A" ? (
                                          <a 
                                            href={c.linkedinUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="text-muted-foreground hover:text-primary transition-colors text-xs flex items-center gap-1"
                                          >
                                            <ExternalLink className="h-2.5 w-2.5" /> LinkedIn
                                          </a>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-muted-foreground group-hover:text-foreground transition-colors">{c.location}</td>
                                    <td className="px-6 py-4">
                                      <div className="max-w-[140px] truncate font-medium text-muted-foreground group-hover:text-foreground transition-colors" title={c.companyName}>
                                        {c.companyName}
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <Badge 
                                        variant={c.contactStatus === "Contacted" ? "default" : "secondary"} 
                                        className={`font-bold text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                          c.contactStatus === "Contacted" ? 'bg-primary/20 text-primary border-none' : 'bg-muted text-muted-foreground border-none'
                                        }`}
                                      >
                                        {c.contactStatus || "Not Contacted"}
                                      </Badge>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="flex items-center justify-end gap-2">
                                        {c.contactStatus === "Contacted" ? (
                                          <Button variant="ghost" size="sm" disabled className="h-8 gap-1.5 text-[10px] uppercase font-bold text-muted-foreground/50">
                                            <UserCheck className="h-3.5 w-3.5" />
                                            Already Contacted
                                          </Button>
                                        ) : (
                                          <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-8 gap-1.5 text-[10px] uppercase font-bold border-primary/20 text-primary hover:bg-primary/5"
                                            onClick={() => handleContactCandidate(c._id)}
                                            disabled={actionLoading === `contact-${c._id}`}
                                          >
                                            {actionLoading === `contact-${c._id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                                            Contact Candidate
                                          </Button>
                                        )}
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
                                          onClick={() => handleDeleteCandidate(c._id)}
                                          disabled={actionLoading === `delete-${c._id}`}
                                        >
                                          {actionLoading === `delete-${c._id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-muted-foreground/20 p-12 text-center bg-muted/5 group">
                          <div className="bg-muted w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300">
                            <Users className="h-8 w-8 text-muted-foreground/50" />
                          </div>
                          <p className="text-base font-bold text-foreground">No candidates to manage</p>
                          <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                            Go to the <span className="font-bold text-primary">View Details</span> or create a new specification to start sourcing.
                          </p>
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Jobs;
