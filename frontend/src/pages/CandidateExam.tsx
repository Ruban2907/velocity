import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface CandidateQuestion {
  question: string;
  options: string[];
  difficulty: "easy" | "medium" | "hard";
}

interface ExamPayload {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  totalQuestions: number;
  questions: CandidateQuestion[];
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const POLICY_GRACE_SECONDS = 20;
const EXAM_DURATION_SECONDS = 30 * 60;

const CandidateExam = () => {
  const { token } = useParams();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cancelledRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);

  const [exam, setExam] = useState<ExamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(EXAM_DURATION_SECONDS);

  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [fullScreenExitCount, setFullScreenExitCount] = useState(0);
  const [visibilityHiddenCount, setVisibilityHiddenCount] = useState(0);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const [micTrackActive, setMicTrackActive] = useState(false);
  const [cameraTrackActive, setCameraTrackActive] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [windowFocused, setWindowFocused] = useState(true);
  const [focusViolationActive, setFocusViolationActive] = useState(false);
  const [mediaViolationActive, setMediaViolationActive] = useState(false);
  const [policyCountdown, setPolicyCountdown] = useState<number | null>(null);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    const loadExam = async () => {
      if (!token) {
        setError("Invalid exam link");
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/api/assessments/exam/${token}`);
        setExam(response?.data?.data || null);
      } catch (requestError: any) {
        setError(requestError?.response?.data?.message || "Failed to load exam.");
      } finally {
        setLoading(false);
      }
    };

    loadExam();
  }, [token]);

  useEffect(() => {
    const setupProctoringSignals = async () => { //setup proctoring signals
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        mediaStreamRef.current = stream;
        const [audioTrack] = stream.getAudioTracks();
        const [videoTrack] = stream.getVideoTracks();
        audioTrackRef.current = audioTrack || null;
        videoTrackRef.current = videoTrack || null;

        setMicPermissionGranted(Boolean(audioTrack));
        setCameraPermissionGranted(Boolean(videoTrack));
        setMicTrackActive(Boolean(audioTrack && audioTrack.enabled && audioTrack.readyState === "live"));
        setCameraTrackActive(Boolean(videoTrack && videoTrack.enabled && videoTrack.readyState === "live"));
        setMicEnabled(Boolean(audioTrack?.enabled));
        setVideoEnabled(Boolean(videoTrack?.enabled));

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        const refreshTrackState = () => {
          setMicTrackActive(Boolean(audioTrack && audioTrack.enabled && audioTrack.readyState === "live"));
          setCameraTrackActive(Boolean(videoTrack && videoTrack.enabled && videoTrack.readyState === "live"));
          setMicEnabled(Boolean(audioTrack?.enabled));
          setVideoEnabled(Boolean(videoTrack?.enabled));
        };

        audioTrack?.addEventListener("mute", refreshTrackState);
        audioTrack?.addEventListener("unmute", refreshTrackState);
        audioTrack?.addEventListener("ended", refreshTrackState);
        videoTrack?.addEventListener("mute", refreshTrackState);
        videoTrack?.addEventListener("unmute", refreshTrackState);
        videoTrack?.addEventListener("ended", refreshTrackState);
      } catch {
        setMicPermissionGranted(false);
        setCameraPermissionGranted(false);
        setMicTrackActive(false);
        setCameraTrackActive(false);
      }
    };

    setupProctoringSignals();

    const onBlur = () => { //user switched to another tab 
      setTabSwitchCount((prev) => prev + 1);
      setWindowFocused(false);
    };
    const onFocus = () => setWindowFocused(true);
    const onVisibilityChange = () => { //user minimized the window
      if (document.visibilityState === "hidden") {
        setVisibilityHiddenCount((prev) => prev + 1);
      }
      setWindowFocused(document.visibilityState === "visible" && document.hasFocus());
    };
    const onFullScreenChange = () => { //user exited fullscreen mode
      if (!document.fullscreenElement) {
        setFullScreenExitCount((prev) => prev + 1);
      }
    };

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullScreenChange);

    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullScreenChange);
      const stream = mediaStreamRef.current || (videoRef.current?.srcObject as MediaStream | null);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!loading && exam) {
      requestFullScreen();
    }
  }, [loading, exam]);

  useEffect(() => {
    setFocusViolationActive(!windowFocused || document.visibilityState !== "visible");
  }, [windowFocused]);

  useEffect(() => {
    setMediaViolationActive(!micTrackActive || !cameraTrackActive);
  }, [micTrackActive, cameraTrackActive]);

  useEffect(() => {
    if (cancelled || hasSubmitted) {
      return;
    }

    if (!focusViolationActive && !mediaViolationActive) {
      setPolicyCountdown(null);
      return;
    }

    let remaining = POLICY_GRACE_SECONDS;
    setPolicyCountdown(remaining);

    const timer = window.setInterval(() => {
      remaining -= 1;
      setPolicyCountdown(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [focusViolationActive, mediaViolationActive, cancelled, hasSubmitted]);

  useEffect(() => {
    if (loading || !exam || cancelled || hasSubmitted) {
      return;
    }

    let remaining = EXAM_DURATION_SECONDS;
    setTimeRemaining(remaining);

    const timer = window.setInterval(() => {
      remaining -= 1;
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loading, exam, cancelled, hasSubmitted]);

  const cancelExam = async (reason: string) => {
    if (!token || cancelledRef.current) {
      return;
    }

    cancelledRef.current = true;
    setCancelled(true);
    setSubmitMessage("Exam cancelled due to policy violation.");

    try {
      await axios.post(`${API_URL}/api/assessments/exam/${token}/cancel`, {
        reason,
        antiCheat: {
          tabSwitchCount,
          fullScreenExitCount,
          visibilityHiddenCount,
          micPermissionGranted,
          cameraPermissionGranted,
          micTrackActive,
          cameraTrackActive,
          integrityNotes,
        },
      });
    } catch {
      // Best effort. Candidate sees local cancellation immediately even if network fails.
    }
  };

  useEffect(() => {
    if (policyCountdown !== 0) {
      return;
    }

    if (focusViolationActive) {
      cancelExam("Browser focus lost for over 20 seconds");
      return;
    }

    if (mediaViolationActive) {
      cancelExam("Microphone/camera inactive for over 20 seconds");
    }
  }, [policyCountdown, focusViolationActive, mediaViolationActive]);

  useEffect(() => {
    if (timeRemaining !== 0 || cancelled || hasSubmitted || submitting) {
      return;
    }

    handleSubmit(true);
  }, [timeRemaining, cancelled, hasSubmitted, submitting]);

  const integrityNotes = useMemo(() => {
    const issues: string[] = [];

    if (tabSwitchCount > 0) issues.push(`Tab/app switches: ${tabSwitchCount}`);
    if (visibilityHiddenCount > 0) issues.push(`Hidden tab events: ${visibilityHiddenCount}`);
    if (fullScreenExitCount > 0) issues.push(`Fullscreen exits: ${fullScreenExitCount}`);
    if (!micTrackActive) issues.push("Microphone inactive");
    if (!cameraTrackActive) issues.push("Camera inactive");

    return issues.join(" | ");
  }, [tabSwitchCount, visibilityHiddenCount, fullScreenExitCount, micTrackActive, cameraTrackActive]);

  const requestFullScreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Some browsers require explicit user interaction; button remains available.
    }
  };

  const toggleMic = () => {
    const track = audioTrackRef.current;
    if (!track) {
      return;
    }

    track.enabled = !track.enabled;
    setMicEnabled(track.enabled);
    setMicTrackActive(Boolean(track.enabled && track.readyState === "live"));
  };

  const toggleCamera = () => {
    const track = videoTrackRef.current;
    if (!track) {
      return;
    }

    track.enabled = !track.enabled;
    setVideoEnabled(track.enabled);
    setCameraTrackActive(Boolean(track.enabled && track.readyState === "live"));
  };

  const handleSubmit = async (autoSubmit = false) => {
    if (!token) return;
    if (cancelled || submitting || hasSubmitted) {
      return;
    }

    try {
      setSubmitting(true);
      setSubmitMessage("");
      const response = await axios.post(`${API_URL}/api/assessments/exam/${token}/submit`, {
        answers,
        antiCheat: {
          tabSwitchCount,
          fullScreenExitCount,
          visibilityHiddenCount,
          micPermissionGranted,
          cameraPermissionGranted,
          micTrackActive,
          cameraTrackActive,
          integrityNotes,
        },
      });

      const score = response?.data?.data?.score ?? 0;
      const total = response?.data?.data?.totalQuestions ?? 0;
      setHasSubmitted(true);
      setSubmitMessage(
        autoSubmit
          ? `Time is up. Paper submitted automatically. Score: ${score}/${total}`
          : `Submitted successfully. Score: ${score}/${total}`,
      );
    } catch (submitError: any) {
      setSubmitMessage(submitError?.response?.data?.message || "Failed to submit exam.");
    } finally {
      setSubmitting(false);
    }
  };

  const formattedTimeRemaining = useMemo(() => {
    const safeSeconds = Math.max(0, timeRemaining);
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [timeRemaining]);

  if (loading) {
    return <div className="mx-auto max-w-3xl p-8">Loading exam...</div>;
  }

  if (error || !exam) {
    return <div className="mx-auto max-w-3xl p-8 text-red-500">{error || "Exam not found"}</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{exam.jobTitle} Assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Candidate: {exam.candidateName} ({exam.candidateEmail})
          </p>
          <p>
            Proctoring status: mic {micTrackActive ? "active" : "inactive"}, camera {cameraTrackActive ? "active" : "inactive"}
          </p>
          <p className={`font-medium ${timeRemaining <= 300 ? "text-red-500" : "text-foreground"}`}>
            Time Remaining: {formattedTimeRemaining}
          </p>
          {focusViolationActive || mediaViolationActive ? (
            <p className="text-red-500">
              Policy warning: stay focused in this exam tab and keep mic/camera active.
              {policyCountdown !== null ? ` Auto-cancel in ${policyCountdown}s.` : ""}
            </p>
          ) : null}
          <p className="text-muted-foreground">
            Browser-only monitoring is active (tab switch, fullscreen exit, visibility, mic/camera state). For strict lock-down,
            use a dedicated secure browser or managed device policy.
          </p>
          <div className="flex gap-2">
            <Button onClick={requestFullScreen}>Re-enter Fullscreen</Button>
            <span className="text-xs text-muted-foreground self-center">Fullscreen is requested automatically on exam load.</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {exam.questions.map((question, index) => (
            <Card key={`${question.question}-${index}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  Q{index + 1}. {question.question}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup value={answers[index] || ""} onValueChange={(value) => setAnswers((prev) => ({ ...prev, [index]: value }))}>
                  {question.options.map((option, optionIndex) => {
                    const letter = String.fromCharCode(65 + optionIndex);
                    return (
                      <div key={`${index}-${letter}`} className="flex items-center gap-2 border rounded p-2">
                        <RadioGroupItem value={letter} id={`q-${index}-${letter}`} />
                        <Label htmlFor={`q-${index}-${letter}`}>{option}</Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-base">Proctoring Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-hidden rounded-md border bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="h-[180px] w-full object-cover" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={micEnabled ? "default" : "destructive"} onClick={toggleMic}>
                {micEnabled ? "Mic On" : "Mic Off"}
              </Button>
              <Button type="button" variant={videoEnabled ? "default" : "destructive"} onClick={toggleCamera}>
                {videoEnabled ? "Camera On" : "Camera Off"}
              </Button>
            </div>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Mic track: {micTrackActive ? "active" : "inactive"}</p>
              <p>Video track: {cameraTrackActive ? "active" : "inactive"}</p>
              <p>Focus lost: {tabSwitchCount}</p>
              <p>Fullscreen exits: {fullScreenExitCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2 mb-4 text-sm">
            <p>Tab switches: {tabSwitchCount}</p>
            <p>Hidden tab events: {visibilityHiddenCount}</p>
            <p>Fullscreen exits: {fullScreenExitCount}</p>
          </div>
          <Button onClick={() => handleSubmit()} disabled={submitting || cancelled}>
            {submitting ? "Submitting..." : cancelled ? "Exam Cancelled" : "Submit Exam"}
          </Button>
          {submitMessage ? <p className="mt-3 text-sm">{submitMessage}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default CandidateExam;
