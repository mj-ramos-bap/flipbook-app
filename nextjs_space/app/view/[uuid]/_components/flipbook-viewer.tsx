"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FlipbookCanvas from "./flipbook-canvas";

interface ViewerData {
  id: string;
  uuid: string;
  title: string;
  pageCount: number;
  pdfUrl: string | null;
  passwordProtected: boolean;
  pagesPerView: string;
  enableShare: boolean;
  enablePrint: boolean;
  enableDownload: boolean;
  enableAnimatedFlip: boolean;
  enablePageSound: boolean;
  branding: {
    primaryColor: string;
    secondaryColor: string;
    loadingText: string;
    logoUrl: string | null;
  };
}

export default function FlipbookViewer({ uuid, token }: { uuid: string; token?: string }) {
  const [data, setData] = useState<ViewerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const sessionIdRef = useRef("");
  const startTimeRef = useRef(Date.now());
  const viewTrackedRef = useRef(false);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Persist sessionId in sessionStorage so page refreshes reuse the same session
    const storageKey = `fb_session_${uuid}`;
    const existing = typeof window !== "undefined" ? sessionStorage?.getItem?.(storageKey) : null;
    if (existing) {
      sessionIdRef.current = existing;
    } else {
      sessionIdRef.current = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      if (typeof window !== "undefined") sessionStorage?.setItem?.(storageKey, sessionIdRef.current);
    }
    fetchData();

    // Periodic heartbeat to update duration every 30 seconds
    durationIntervalRef.current = setInterval(() => {
      sendDurationUpdate();
    }, 30000);

    // Use beacon API on page unload for reliable final duration update
    const handleUnload = () => {
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (duration > 0 && typeof navigator?.sendBeacon === "function") {
        navigator.sendBeacon(
          `/api/viewer/${uuid}/track`,
          new Blob([JSON.stringify({ type: "update-duration", sessionId: sessionIdRef.current, duration })], { type: "application/json" })
        );
      }
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      window.removeEventListener("beforeunload", handleUnload);
      sendDurationUpdate();
    };
  }, [uuid]);

  // Prevent right-click
  useEffect(() => {
    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  const fetchData = async () => {
    try {
      const apiUrl = token ? `/api/viewer/${uuid}?t=${token}` : `/api/viewer/${uuid}`;
      const res = await fetch(apiUrl);
      if (!res.ok) {
        setError(res.status === 404 ? "Flipbook not found" : res.status === 403 ? "Access denied - domain not allowed" : "Failed to load");
        setLoading(false);
        return;
      }
      const result = (await res.json()) ?? {};
      setData(result);
      if (result?.passwordProtected) {
        // Check session storage
        const stored = sessionStorage?.getItem?.(`fb_auth_${uuid}`);
        if (stored === "true") {
          setAuthenticated(true);
          trackView();
        } else {
          setNeedsPassword(true);
        }
      } else {
        setAuthenticated(true);
        trackView();
      }
    } catch (e: any) {
      setError("Failed to load flipbook");
    } finally {
      setLoading(false);
    }
  };

  const trackView = async () => {
    // Only track one view per session (refreshes reuse sessionId)
    if (viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    startTimeRef.current = Date.now();
    try {
      await fetch(`/api/viewer/${uuid}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "view", sessionId: sessionIdRef.current }),
      });
    } catch {}
  };

  const sendDurationUpdate = async () => {
    const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
    if (duration <= 0) return;
    try {
      await fetch(`/api/viewer/${uuid}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "update-duration", sessionId: sessionIdRef.current, duration }),
      });
    } catch {}
  };

  const trackPage = useCallback(async (pageNumber: number) => {
    try {
      await fetch(`/api/viewer/${uuid}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "page", sessionId: sessionIdRef.current, pageNumber }),
      });
    } catch {}
  }, [uuid]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    try {
      const res = await fetch(`/api/viewer/${uuid}/verify-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await res.json()) ?? {};
      if (result?.valid) {
        setAuthenticated(true);
        setNeedsPassword(false);
        sessionStorage?.setItem?.(`fb_auth_${uuid}`, "true");
        trackView();
      } else {
        setPasswordError("Incorrect password");
      }
    } catch {
      setPasswordError("Verification failed");
    }
  };

  const primaryColor = data?.branding?.primaryColor ?? "#4F46E5";
  const secondaryColor = data?.branding?.secondaryColor ?? "#7C3AED";

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: `linear-gradient(135deg, ${primaryColor}10, ${secondaryColor}10)` }}>
        <Loader2 className="w-10 h-10 animate-spin mb-4" style={{ color: primaryColor }} />
        <p className="text-sm text-gray-600">{data?.branding?.loadingText ?? "Loading your flipbook..."}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  if (needsPassword && !authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${secondaryColor}08)` }}>
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4">
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto rounded-xl flex items-center justify-center mb-3" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}>
              <Lock className="w-7 h-7 text-white" />
            </div>
            <h2 className="font-display text-xl font-bold">Password Required</h2>
            <p className="text-sm text-gray-500 mt-1">Enter the password to view this flipbook</p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {passwordError && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{passwordError}</div>}
            <Input type="password" value={password} onChange={(e: any) => setPassword(e?.target?.value ?? "")} placeholder="Enter password" required autoFocus />
            <Button type="submit" className="w-full" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}>Unlock</Button>
          </form>
        </div>
      </div>
    );
  }

  if (!data?.pdfUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">PDF not available</p>
      </div>
    );
  }

  return (
    <div className="h-screen select-none overflow-hidden" style={{ userSelect: "none", WebkitUserSelect: "none" }}
      onCopy={(e: any) => e?.preventDefault?.()}
      onCut={(e: any) => e?.preventDefault?.()}
    >
      <FlipbookCanvas
        pdfUrl={data.pdfUrl}
        title={data?.title ?? "Flipbook"}
        pagesPerView={data?.pagesPerView ?? "double"}
        enableShare={data?.enableShare ?? false}
        enablePrint={data?.enablePrint ?? false}
        enableDownload={data?.enableDownload ?? false}
        enableAnimatedFlip={data?.enableAnimatedFlip ?? true}
        enablePageSound={data?.enablePageSound ?? true}
        branding={data?.branding ?? { primaryColor: "#4F46E5", secondaryColor: "#7C3AED", loadingText: "", logoUrl: null }}
        uuid={uuid}
        onPageChange={trackPage}
      />
    </div>
  );
}
