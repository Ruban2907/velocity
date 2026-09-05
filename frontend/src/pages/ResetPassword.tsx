import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Search, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { resetPassword } from "@/services/authService";

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast({
        title: "Missing token",
        description: "Password reset token is missing from the URL.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Please make sure both passwords are identical.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const response = await resetPassword(token, password);
      if (response.success) {
        setIsSuccess(true);
        toast({
          title: "Password reset successful",
          description: "Your password has been updated. Please sign in.",
        });
        setTimeout(() => {
          navigate("/login");
        }, 2000);
      }
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.message ||
        "Unable to reset password. The link may have expired or already been used.";
      toast({
        title: "Reset failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 mb-8">
            <Search className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">VELOCITY</span>
          </div>

          <Card className="p-8 bg-card/80 backdrop-blur">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">Reset Password</h1>
              <p className="text-muted-foreground">
                Set a new, secure password for your account.
              </p>
            </div>

            {!token ? (
              <div className="space-y-6">
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-destructive">Invalid or Missing Link</p>
                    <p className="text-muted-foreground mt-1">
                      No reset token was found in the link. Please request a new password reset link.
                    </p>
                  </div>
                </div>
                <Link to="/forgot-password">
                  <Button className="w-full bg-primary hover:bg-primary/90">
                    Request New Link
                  </Button>
                </Link>
              </div>
            ) : isSuccess ? (
              <div className="space-y-6 text-center">
                <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Password Reset Complete</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Redirecting you to the sign-in page...
                  </p>
                </div>
                <Link to="/login">
                  <Button className="w-full bg-primary hover:bg-primary/90">
                    Proceed to Login
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter new password (min. 6 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting password...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </Button>

                <div className="flex justify-between text-sm text-muted-foreground">
                  <Link to="/login" className="text-primary hover:underline">
                    Back to Login
                  </Link>
                  <Link to="/forgot-password" className="text-primary hover:underline">
                    Request new link
                  </Link>
                </div>
              </form>
            )}
          </Card>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/20 to-secondary/20 items-center justify-center p-12">
        <div className="max-w-lg text-center space-y-6">
          <div className="w-64 h-64 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Search className="h-32 w-32 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">
            Account Security
          </h2>
          <p className="text-lg text-muted-foreground">
            Create a unique password to protect your recruitment pipeline and candidate data.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
