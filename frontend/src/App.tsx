import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Candidates from "./pages/Candidates";
import Jobs from "./pages/Jobs";
import Analytics from "./pages/Analytics";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Features from "./pages/Features";
import HowItWorks from "./pages/HowItWorks";
import Technology from "./pages/Technology";
import Contact from "./pages/Contact";
import Pricing from "./pages/Pricing";
import ResumeParser from "./pages/ResumeParser";
import EmailTemplates from "./pages/EmailTemplates";
import Assessments from "./pages/Assessments";
import Preferences from "./pages/Preferences";
import CandidateExam from "./pages/CandidateExam";
import AdminDashboard from "./pages/admin/AdminDashboard";
import RecruiterManagement from "./pages/admin/RecruiterManagement";
import ActivityLogs from "./pages/admin/ActivityLogs";
import AdminRoute from "./components/AdminRoute";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            <Route path="/features" element={<Features />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/technology" element={<Technology />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/exam/:token" element={<CandidateExam />} />
            
            {/* Protected routes - accessible to all authenticated users */}
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/candidates" 
              element={
                <ProtectedRoute>
                  <Candidates />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/jobs" 
              element={
                <ProtectedRoute>
                  <Jobs />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/analytics" 
              element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/resume-parser" 
              element={
                <ProtectedRoute>
                  <ResumeParser />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/email-templates" 
              element={
                <ProtectedRoute>
                  <EmailTemplates />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/assessments" 
              element={
                <ProtectedRoute>
                  <Assessments />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/preferences" 
              element={
                <ProtectedRoute>
                  <Preferences />
                </ProtectedRoute>
              } 
            />

            {/* Admin specific routes */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/recruiters" element={<ProtectedRoute><RecruiterManagement /></ProtectedRoute>} />
              <Route path="/admin/activity" element={<ProtectedRoute><ActivityLogs /></ProtectedRoute>} />
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
