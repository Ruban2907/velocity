import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

export interface Candidate {
  _id?: string;
  name: string;
  title: string;
  seniority: string;
  email: string;
  emailStatus?: string;
  phone?: string;
  linkedinUrl: string;
  location: string;
  companyName: string;
  companyDomain: string;
  companyIndustry?: string;
  companySize?: string;
  contactStatus?: string;
}

interface CandidateListProps {
  candidates: Candidate[];
}

const CandidateList: React.FC<CandidateListProps> = ({ candidates }) => {
  const [localCandidates, setLocalCandidates] = useState<Candidate[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    setLocalCandidates(candidates);
  }, [candidates]);

  if (!localCandidates || localCandidates.length === 0) {
    return null;
  }

  const handleMarkContacted = async (id: string | undefined) => {
    if (!id) return;
    try {
      const response = await api.put(`/recruitment/candidates/${id}/contacted`);
      if (response.data.success) {
        setLocalCandidates(prev => 
          prev.map(c => c._id === id ? { ...c, contactStatus: "Contacted" } : c)
        );
        toast({ title: "Success", description: "Candidate marked as contacted." });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to update status." });
    }
  };

  const handleDelete = async (id: string | undefined) => {
    if (!id) return;
    try {
      const response = await api.delete(`/recruitment/candidates/${id}`);
      if (response.data.success) {
        setLocalCandidates(prev => prev.filter(c => c._id !== id));
        toast({ title: "Success", description: "Candidate deleted successfully." });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete candidate." });
    }
  };

  return (
    <div className="mt-8 border rounded-md overflow-x-auto bg-card">
      <table className="w-full text-sm text-left">
        <thead className="bg-muted text-muted-foreground border-b whitespace-nowrap">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Seniority</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">LinkedIn</th>
            <th className="px-4 py-3 font-medium">Location</th>
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {localCandidates.map((candidate, idx) => (
            <tr key={candidate._id || idx} className="hover:bg-muted/50 transition-colors whitespace-nowrap">
              <td className="px-4 py-3 font-medium">{candidate.name}</td>
              <td className="px-4 py-3">
                <div className="max-w-[200px] truncate" title={candidate.title}>
                  {candidate.title}
                </div>
              </td>
              <td className="px-4 py-3">{candidate.seniority}</td>
              <td className="px-4 py-3">
                {candidate.email === "N/A" ? (
                  <span className="text-muted-foreground italic">Not available</span>
                ) : (
                  <a href={`mailto:${candidate.email}`} className="text-primary hover:underline">
                    {candidate.email}
                  </a>
                )}
              </td>
              <td className="px-4 py-3">
                {candidate.linkedinUrl && candidate.linkedinUrl !== "N/A" ? (
                  <a 
                    href={candidate.linkedinUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-primary hover:underline"
                  >
                    View Profile
                  </a>
                ) : (
                  <span className="text-muted-foreground">N/A</span>
                )}
              </td>
              <td className="px-4 py-3">{candidate.location}</td>
              <td className="px-4 py-3">
                <div className="max-w-[150px] truncate" title={candidate.companyName}>
                  {candidate.companyName}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant={candidate.contactStatus === "Contacted" ? "default" : "secondary"}>
                  {candidate.contactStatus || "Not Contacted"}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleMarkContacted(candidate._id)}
                    disabled={candidate.contactStatus === "Contacted" || !candidate._id}
                  >
                    Mark Contacted
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive" 
                    onClick={() => handleDelete(candidate._id)}
                    disabled={!candidate._id}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CandidateList;
