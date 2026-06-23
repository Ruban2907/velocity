import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, AlertCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Candidate {
  _id: string;
  name: string;
  title?: string;
  position?: string;
  jobTitle?: string;
  companyName?: string;
  company?: string;
  email?: string;
  contactStatus?: string;
  matchScore?: number;
  jobId?: {
    _id: string;
    jobTitle: string | string[];
  };
}

interface JobFilter {
  key: string;
  title: string;
  candidateCount: number;
  jobIds: string[];
}

const Candidates = () => {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobFilters, setJobFilters] = useState<JobFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilterKey, setSelectedFilterKey] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchFilters = async () => {
    try {
      const response = await api.get("/candidates/job-filters");
      console.log("JOB FILTERS API RESPONSE:", response.data);
      const filters = Array.isArray(response.data?.filters) ? response.data.filters : [];
      setJobFilters(filters);
    } catch (err) {
      console.error("Error fetching job filters:", err);
    }
  };

  const fetchCandidates = async () => {
    setLoading(true);
    setError("");
    try {
      const params: any = { page: 1, limit: 100 };
      if (debouncedSearch) params.q = debouncedSearch;
      
      if (selectedFilterKey) {
        const filter = jobFilters.find(f => f.key === selectedFilterKey);
        if (filter) {
          if (Array.isArray(filter.jobIds) && filter.jobIds.length > 0) {
            params.jobIds = filter.jobIds.join(",");
          } else if (filter.jobId) {
            params.jobId = filter.jobId;
          }
        }
      }

      const response = await api.get("/candidates", { params });
      console.log("CANDIDATES API RESPONSE:", response.data);
      
      const candidatesData = Array.isArray(response.data?.candidates)
        ? response.data.candidates
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];
          
      setCandidates(candidatesData);
    } catch (err: any) {
      console.error("Error fetching candidates:", err);
      setError("Failed to load candidates.");
      toast({
        title: "Error",
        description: "Failed to load candidates from server.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkContacted = async (candidateId: string) => {
    if (!candidateId) return;
    console.log("MARK CONTACTED:", candidateId);
    setActionLoadingId(`${candidateId}-contacted`);
    try {
      await api.patch(`/candidates/${candidateId}/contacted`);
      toast({
        title: "Success",
        description: "Candidate marked as contacted.",
      });
      // Update local state instead of full refetch for better UX
      setCandidates(prev => 
        prev.map(c => (c._id === candidateId ? { ...c, contactStatus: "contacted" } : c))
      );
    } catch (err) {
      console.error("Error marking candidate as contacted:", err);
      toast({
        title: "Error",
        description: "Failed to mark candidate as contacted.",
        variant: "destructive",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemove = async (candidateId: string) => {
    if (!candidateId) return;
    if (!window.confirm("Remove this candidate from the list?")) return;
    
    console.log("REMOVE CANDIDATE:", candidateId);
    setActionLoadingId(`${candidateId}-remove`);
    try {
      await api.delete(`/candidates/${candidateId}`);
      toast({
        title: "Success",
        description: "Candidate removed.",
      });
      // Remove from local state
      setCandidates(prev => prev.filter(c => c._id !== candidateId));
      // Refresh filters as counts might change
      fetchFilters();
    } catch (err) {
      console.error("Error removing candidate:", err);
      toast({
        title: "Error",
        description: "Failed to remove candidate.",
        variant: "destructive",
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [debouncedSearch, selectedFilterKey, jobFilters.length]);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "contacted": return "bg-primary/10 text-primary";
      case "not_contacted": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const formatStatus = (status: string) => {
    return status === "contacted" ? "Contacted" : "Not Contacted";
  };

  const getJobTitle = (candidate: Candidate) => {
    const title = candidate.jobId?.jobTitle || candidate.jobTitle || "General";
    return Array.isArray(title) ? title[0] : title;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-2">Candidates</h1>
            <p className="text-muted-foreground">Manage and review all sourced candidates</p>
          </div>
        </div>

        {/* Search and Filter */}
        <Card className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by name, title, company, or email..." 
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select 
                className="bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={selectedFilterKey}
                onChange={(e) => setSelectedFilterKey(e.target.value)}
              >
                <option value="">All Job Specifications</option>
                {jobFilters.map(filter => (
                  <option key={filter.key} value={filter.key}>
                    {filter.title} ({filter.candidateCount})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Candidates Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                <p>Loading candidates...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-destructive">
                <AlertCircle className="h-8 w-8 mb-4" />
                <p>{error}</p>
                <Button variant="ghost" onClick={fetchCandidates} className="mt-4">Try Again</Button>
              </div>
            ) : candidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-center px-4">
                <Search className="h-12 w-12 mb-4 opacity-20" />
                <h3 className="text-lg font-medium text-foreground">No candidates found</h3>
                <p className="max-w-xs mx-auto">
                  {searchTerm || selectedFilterKey 
                    ? "Try adjusting your filters or search terms." 
                    : "No candidates found yet. Run candidate sourcing from a job specification first."}
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Name</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Position</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Company</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Email</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Job</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {candidates.map((candidate) => (
                    <tr key={candidate._id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 text-foreground font-medium">
                        {candidate.name || "Unknown"}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {candidate.title || candidate.position || "N/A"}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {candidate.companyName || candidate.company || "N/A"}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {candidate.email || "N/A"}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={getStatusColor(candidate.contactStatus || "")} variant="secondary">
                          {formatStatus(candidate.contactStatus || "")}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-sm">
                        {getJobTitle(candidate)}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {candidate.contactStatus === "contacted" ? (
                            <Button variant="outline" size="sm" disabled className="text-primary opacity-70">
                              Contacted
                            </Button>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleMarkContacted(candidate._id)}
                              disabled={actionLoadingId === `${candidate._id}-contacted`}
                            >
                              {actionLoadingId === `${candidate._id}-contacted` ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              ) : null}
                              Mark Contacted
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemove(candidate._id)}
                            disabled={actionLoadingId === `${candidate._id}-remove`}
                          >
                            {actionLoadingId === `${candidate._id}-remove` ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : null}
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Candidates;
