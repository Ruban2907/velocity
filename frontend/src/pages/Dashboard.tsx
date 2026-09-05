import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Target, FileText, Sparkles, Mail } from "lucide-react";
import { Users, Trophy, Star } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import JobSpecForm from "@/components/recruitment/JobSpecForm";

const Dashboard = () => {
  const { user } = useAuth();
  
  const getUserDisplayName = () => {
    if (!user) return "there";
    if (user.firstname) {
      return user.firstname;
    }
    return user.email.split("@")[0];
  };

  return (
    <DashboardLayout>
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="text-4xl font-bold text-foreground mb-2">Dashboard Overview</h1>
          <p className="text-muted-foreground">
            Welcome back, {getUserDisplayName()}! Here's what's happening with your recruitment.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg" className="bg-primary hover:bg-primary/90">
                Create Job Specification
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Job Specification</DialogTitle>
                <DialogDescription>
                  Fill this form to define your candidate search criteria.
                </DialogDescription>
              </DialogHeader>
              <JobSpecForm />
            </DialogContent>
          </Dialog>
          <Button size="lg" variant="outline">
            Export Report
          </Button>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-6 bg-card/50 backdrop-blur border-border hover:shadow-lg transition-all duration-300 hover:scale-105">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-primary/10 rounded-full">
                <Target className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Source Candidates</h3>
                <p className="text-sm text-muted-foreground">Automated talent discovery</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card/50 backdrop-blur border-border hover:shadow-lg transition-all duration-300 hover:scale-105">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-secondary/10 rounded-full">
                <FileText className="h-8 w-8 text-secondary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Parse Resume</h3>
                <p className="text-sm text-muted-foreground">Extract candidate data</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card/50 backdrop-blur border-border hover:shadow-lg transition-all duration-300 hover:scale-105">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-accent/10 rounded-full">
                <Sparkles className="h-8 w-8 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Source Candidates</h3>
                <p className="text-sm text-muted-foreground">AI-powered assessments</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card/50 backdrop-blur border-border hover:shadow-lg transition-all duration-300 hover:scale-105">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 bg-primary/10 rounded-full">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">Source Candidates</h3>
                <p className="text-sm text-muted-foreground">Bulk email campaigns</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-card border-border">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-primary text-5xl font-bold mb-2">247</p>
                <p className="text-muted-foreground">Total Candidates</p>
                <p className="text-sm text-green-500 mt-2">↑ 12% from last month</p>
              </div>
              <Users className="h-8 w-8 text-primary" />
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-primary text-5xl font-bold mb-2">89</p>
                <p className="text-muted-foreground">Assessed</p>
                <p className="text-sm text-green-500 mt-2">↑ 8% from last month</p>
              </div>
              <Trophy className="h-8 w-8 text-accent" />
            </div>
          </Card>

          <Card className="p-6 bg-card border-border">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-primary text-5xl font-bold mb-2">23</p>
                <p className="text-muted-foreground">Shortlisted</p>
                <p className="text-sm text-green-500 mt-2">↑ 15% from last month</p>
              </div>
              <Star className="h-8 w-8 text-accent" />
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
