import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { forgotPassword } from "@/services/authService";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsLoading(true);
      await forgotPassword(email);
      setIsSubmitted(true);
      toast({
        title: "Request submitted",
        description: "If an account exists for this email, a reset link has been sent.",
      });
    } catch (error: any) {
      // Show generic feedback to avoid revealing error states
      setIsSubmitted(true);
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
              <h1 className="text-3xl font-bold text-foreground mb-2">Forgot Password</h1>
              <p className="text-muted-foreground">
                Enter your account email to receive a password reset link.
              </p>
            </div>

            {isSubmitted ? (
              <div className="space-y-6">
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg text-sm text-foreground">
                  <p className="font-semibold mb-1">Check your inbox</p>
                  <p className="text-muted-foreground">
                    If an account is associated with <strong>{email}</strong>, a password reset link has been dispatched. The link is valid for 20 minutes.
                  </p>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <Link to="/login" className="text-primary hover:underline">
                    Back to Login
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setIsSubmitted(false); setEmail(""); }}
                    className="text-primary hover:underline"
                  >
                    Send another request
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
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
                      Sending reset link...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </Button>

                <div className="flex justify-between text-sm text-muted-foreground">
                  <Link to="/login" className="text-primary hover:underline">
                    Back to Login
                  </Link>
                  <Link to="/signup" className="text-primary hover:underline">
                    Create account
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
            Reset your access securely
          </h2>
          <p className="text-lg text-muted-foreground">
            Keep your account protected with a fresh password.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;

