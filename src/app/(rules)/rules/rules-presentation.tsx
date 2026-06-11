"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { submitRulesAcknowledgment } from "./actions";
import { RULES_SLIDES } from "./rules-content";

export function RulesPresentation() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  const total = RULES_SLIDES.length + 1; // +1 for signature slide
  const isLastSlide = current === total - 1;
  const isRulesSlide = current < RULES_SLIDES.length;

  const next = useCallback(() => {
    if (current < total - 1) setCurrent((c) => c + 1);
  }, [current, total]);

  const prev = useCallback(() => {
    if (current > 0) setCurrent((c) => c - 1);
  }, [current]);

  function handleSubmit() {
    if (!signature) {
      setError("Please sign to acknowledge you have read and understood all house rules.");
      return;
    }
    setError(null);
    startSubmitting(async () => {
      const result = await submitRulesAcknowledgment(signature);
      if (result?.error) {
        setError(result.error);
      } else {
        router.push("/dashboard");
      }
    });
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-[#1a1a2e] text-white">
      {/* Progress bar */}
      <div className="h-1 bg-[#16213e]">
        <div
          className="h-full bg-gradient-to-r from-[#e94560] to-[#fbbf24] transition-all duration-300"
          style={{ width: `${((current + 1) / total) * 100}%` }}
        />
      </div>

      {/* Slide content */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {isRulesSlide ? (
          <SlideContent slide={RULES_SLIDES[current]} />
        ) : (
          <SignatureSlide
            signature={signature}
            onSignatureChange={setSignature}
            error={error}
            isSubmitting={isSubmitting}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-[#16213e]">
        <button
          onClick={prev}
          disabled={current === 0}
          className="px-4 py-2 text-sm font-semibold rounded-full bg-[#0f3460] text-white disabled:opacity-30 transition-opacity"
        >
          ← Back
        </button>
        <span className="text-xs text-[#a0a0b0]">
          {current + 1} / {total}
        </span>
        {isLastSlide ? (
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-semibold rounded-full bg-gradient-to-r from-[#e94560] to-[#d63851] text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Saving…
              </>
            ) : (
              "I Agree ✓"
            )}
          </Button>
        ) : (
          <button
            onClick={next}
            className="px-4 py-2 text-sm font-semibold rounded-full bg-gradient-to-r from-[#e94560] to-[#d63851] text-white"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Slide Content ────────────────────────────────────────────

interface SlideData {
  title: string;
  titleColor?: string;
  items?: { num?: number; text: string; bold?: boolean }[];
  bullets?: string[];
  warning?: string;
  note?: string;
}

function SlideContent({ slide }: { slide: SlideData }) {
  const borderColor =
    slide.titleColor === "green"
      ? "border-green-400"
      : slide.titleColor === "blue"
        ? "border-blue-400"
        : slide.titleColor === "yellow"
          ? "border-yellow-400"
          : "border-[#e94560]";

  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500">
      <h2
        className={`text-lg font-bold mb-4 pb-2 border-b-2 inline-block ${borderColor}`}
      >
        {slide.title}
      </h2>

      {slide.items && (
        <div className="space-y-3">
          {slide.items.map((item, i) => (
            <div key={i} className="flex gap-3">
              {item.num !== undefined && (
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-bold ${
                    slide.title.includes("Zero Tolerance")
                      ? "bg-[#e94560] text-white"
                      : "bg-[#0f3460] text-[#a0a0b0]"
                  }`}
                >
                  {item.num}
                </span>
              )}
              <p
                className="text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: item.text }}
              />
            </div>
          ))}
        </div>
      )}

      {slide.bullets && (
        <ul className="space-y-2 mt-2">
          {slide.bullets.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="text-green-400 font-bold">•</span>
              {b}
            </li>
          ))}
        </ul>
      )}

      {slide.warning && (
        <div className="mt-4 p-4 rounded-xl bg-[#e94560]/15 border border-[#e94560]/40 text-sm leading-relaxed">
          <p dangerouslySetInnerHTML={{ __html: slide.warning }} />
        </div>
      )}

      {slide.note && (
        <p className="mt-4 text-xs text-[#a0a0b0] leading-relaxed">
          {slide.note}
        </p>
      )}
    </div>
  );
}

// ─── Signature Slide ──────────────────────────────────────────

function SignatureSlide({
  signature,
  onSignatureChange,
  error,
  isSubmitting,
}: {
  signature: string | null;
  onSignatureChange: (v: string | null) => void;
  error: string | null;
  isSubmitting: boolean;
}) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-3 duration-500 space-y-6">
      <h2 className="text-lg font-bold pb-2 border-b-2 border-[#e94560] inline-block">
        Acknowledgment
      </h2>

      <div className="p-4 rounded-xl bg-[#e94560]/15 border border-[#e94560]/40 text-sm leading-relaxed space-y-3">
        <p>
          <strong>By signing below, I acknowledge that:</strong>
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>I have read and understand all house rules and consequences</li>
          <li>I agree to abide by all rules during my stay</li>
          <li>
            Violation of rules may result in loss of privileges or discharge
          </li>
          <li>
            Relapse, physical violence, stealing, or tampering with cameras will
            result in immediate discharge
          </li>
        </ul>
      </div>

      <div className="bg-white rounded-xl p-1">
        <SignaturePad
          label="Resident Signature"
          initialValue={signature}
          onSignatureChange={onSignatureChange}
        />
      </div>

      <p className="text-xs text-[#a0a0b0]">
        Date: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      </p>

      {error && (
        <p className="text-sm text-[#e94560] bg-[#e94560]/10 rounded-md p-3">
          {error}
        </p>
      )}

      {isSubmitting && (
        <div className="flex items-center gap-2 text-sm text-[#a0a0b0]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving your acknowledgment…
        </div>
      )}
    </div>
  );
}
