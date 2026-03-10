"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type RecordingState = "idle" | "recording" | "recorded" | "evaluating" | "evaluated";

interface SpeakPracticeViewProps {
  textToSpeak: string;
  onContinue: () => void;
}

export function SpeakPracticeView({ textToSpeak, onContinue }: SpeakPracticeViewProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [evaluationResult, setEvaluationResult] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [audioUrl]);

  const requestMicPermission = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPermissionDenied(false);
      return stream;
    } catch {
      setPermissionDenied(true);
      return null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    const stream = await requestMicPermission();
    if (!stream) return;

    audioChunksRef.current = [];
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const url = URL.createObjectURL(audioBlob);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setAudioUrl(url);
      setState("recorded");
    };

    mediaRecorder.start();
    setState("recording");
  }, [requestMicPermission, audioUrl]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop();
      // Stop the stream tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    }
  }, [state]);

  const handleRetry = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setEvaluationResult(null);
    setState("idle");
  }, [audioUrl]);

  const handlePlayback = useCallback(() => {
    if (audioRef.current && audioUrl) {
      audioRef.current.play();
    }
  }, [audioUrl]);

  const handleSubmitForEvaluation = useCallback(() => {
    setState("evaluating");
    // Simulate backend evaluation with 2 second timer
    setTimeout(() => {
      setEvaluationResult("非常好！");
      setState("evaluated");
    }, 2000);
  }, []);

  return (
    <div className="flex flex-col items-center space-y-8">
      {/* Top section: Text to speak */}
      <div className="w-full text-center">
        <p className="mb-2 text-2xl font-semibold text-slate-800">{textToSpeak}</p>
        <p className="text-sm text-slate-500">请朗读</p>
      </div>

      {/* Permission denied warning */}
      {permissionDenied && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          麦克风权限被拒绝。请在浏览器设置中允许麦克风访问后重试。
        </div>
      )}

      {/* Middle section: Recording controls */}
      <div className="flex flex-col items-center space-y-4">
        {state === "idle" && (
          <button
            type="button"
            onMouseDown={startRecording}
            onTouchStart={startRecording}
            className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-700 active:scale-95"
            aria-label="Hold to record"
          >
            <MicIcon className="h-12 w-12" />
          </button>
        )}

        {state === "recording" && (
          <button
            type="button"
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchEnd={stopRecording}
            className="flex h-24 w-24 animate-pulse items-center justify-center rounded-full bg-red-500 text-white shadow-lg"
            aria-label="Release to stop recording"
          >
            <MicIcon className="h-12 w-12" />
          </button>
        )}

        {(state === "recorded" || state === "evaluating" || state === "evaluated") && (
          <div className="flex flex-col items-center space-y-3">
            <button
              type="button"
              onClick={handlePlayback}
              className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-slate-700 shadow-lg transition-transform hover:scale-105 hover:bg-slate-300 active:scale-95"
              aria-label="Play recording"
            >
              <PlayIcon className="h-12 w-12" />
            </button>
            {audioUrl && <audio ref={audioRef} src={audioUrl} />}
          </div>
        )}

        {/* Recording state hint */}
        {state === "idle" && (
          <p className="text-sm text-slate-500">按住录音</p>
        )}
        {state === "recording" && (
          <p className="text-sm text-red-500">正在录音...松开结束</p>
        )}
        {state === "recorded" && (
          <button
            type="button"
            onClick={handleRetry}
            className="text-sm text-blue-600 underline hover:text-blue-700"
          >
            Retry
          </button>
        )}
      </div>

      {/* Evaluation section */}
      {(state === "recorded" || state === "evaluating" || state === "evaluated") && (
        <div className="w-full">
          {state === "recorded" && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleSubmitForEvaluation}
                className="rounded-lg bg-green-600 px-6 py-2 font-medium text-white transition-colors hover:bg-green-700"
              >
                提交评估
              </button>
            </div>
          )}

          {state === "evaluating" && (
            <div className="flex flex-col items-center space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
              <p className="text-sm text-slate-600">评估中</p>
            </div>
          )}

          {state === "evaluated" && evaluationResult && (
            <div className="flex flex-col items-center space-y-2 rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-lg font-medium text-green-700">{evaluationResult}</p>
            </div>
          )}
        </div>
      )}

      {/* Continue button */}
      {state === "evaluated" && (
        <div className="w-full pt-4">
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
          >
            继续
          </button>
        </div>
      )}
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
