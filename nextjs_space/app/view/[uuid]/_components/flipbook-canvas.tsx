"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize,
  Grid3X3, Search, Share2, Printer, Download, X, BookOpen, Loader2,
  ChevronFirst, ChevronLast, Volume2, VolumeX, List,
  ChevronUp, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";

interface TocItem {
  title: string;
  pageNumber: number;
  level: number;
  children?: TocItem[];
}

interface FlipbookCanvasProps {
  pdfUrl: string;
  title: string;
  pagesPerView: string;
  enableShare: boolean;
  enablePrint: boolean;
  enableDownload: boolean;
  enableAnimatedFlip: boolean;
  enablePageSound: boolean;
  branding: { primaryColor: string; secondaryColor: string; loadingText: string; logoUrl: string | null };
  uuid: string;
  onPageChange: (page: number) => void;
}

export default function FlipbookCanvas({
  pdfUrl, title, pagesPerView, enableShare, enablePrint, enableDownload,
  enableAnimatedFlip, enablePageSound, branding, uuid, onPageChange,
}: FlipbookCanvasProps) {
  // ── Refs ──────────────────────────────────────────────────────────
  const containerRef  = useRef<HTMLDivElement>(null); // fullscreen root
  const bookWrapRef   = useRef<HTMLDivElement>(null); // PageFlip mounts here
  const pageFlipRef   = useRef<any>(null);
  const pdfDocRef     = useRef<any>(null);
  const renderedRef   = useRef<Set<number>>(new Set());
  const canvasesRef   = useRef<(HTMLCanvasElement | null)[]>([]);
  const displayWRef        = useRef(0);
  const displayHRef        = useRef(0);
  const zoomRef            = useRef(1);
  const isFullscreenRef    = useRef(false); // mirrors isFullscreen but synchronous
  const fsTransitionRef    = useRef(false); // set BEFORE exitFullscreen() so resize is blocked immediately
  const fsZoomRef          = useRef(1);     // current fullscreen CSS-zoom factor (used by renderPdfPage for quality)
  const isDoubleRef        = useRef(pagesPerView === "double");
  const goToPageRef   = useRef<(p: number) => void>(() => {});
  const pageTextsRef  = useRef<Map<number, string>>(new Map());
  const savedPageRef  = useRef(1); // preserves page when re-initializing on mode toggle

  // ── State ─────────────────────────────────────────────────────────
  const [totalPages,     setTotalPages]     = useState(0);
  const [currentPage,    setCurrentPage]    = useState(1);
  const [pdfLoaded,      setPdfLoaded]      = useState(false);
  const [bookReady,      setBookReady]      = useState(false);
  const [pageNatW,       setPageNatW]       = useState(0);
  const [pageNatH,       setPageNatH]       = useState(0);
  const [displayW,       setDisplayW]       = useState(0); // resolved page display width
  const [displayH,       setDisplayH]       = useState(0); // resolved page display height
  const [zoom,           setZoom]           = useState(1);
  const [resizeKey,      setResizeKey]      = useState(0); // bumped on window resize → re-init PageFlip
  const [isFullscreen,   setIsFullscreen]   = useState(false);
  const [isDouble,       setIsDouble]       = useState(pagesPerView === "double");
  // Keep isDoubleRef in sync so fullscreenchange handler (a closure) can read the current value
  useEffect(() => { isDoubleRef.current = isDouble; }, [isDouble]);
  const [soundEnabled,   setSoundEnabled]   = useState(enablePageSound);
  const [thumbnails,     setThumbnails]     = useState<string[]>([]);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showToc,        setShowToc]        = useState(false);
  const [tocItems,       setTocItems]       = useState<TocItem[]>([]);
  const [hasToc,         setHasToc]         = useState(false);
  const [showSearch,     setShowSearch]     = useState(false);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [searchResults,  setSearchResults]  = useState<{ page: number; snippet: string }[]>([]);
  const [searchIndex,    setSearchIndex]    = useState(0);
  const [isSearching,    setIsSearching]    = useState(false);
  const [searchPerformed,setSearchPerformed]= useState(false);
  const [jumpPage,       setJumpPage]       = useState("");

  const primaryColor = branding?.primaryColor ?? "#4F46E5";

  // ── Audio ─────────────────────────────────────────────────────────
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const soundBufRef    = useRef<AudioBuffer | null>(null);
  const audioRawRef    = useRef<ArrayBuffer | null>(null);
  const audioFetchRef  = useRef(false);

  useEffect(() => {
    if (!enablePageSound || audioFetchRef.current) return;
    audioFetchRef.current = true;
    fetch("/sounds/page-turn.m4a")
      .then(r => r.arrayBuffer())
      .then(ab => { audioRawRef.current = ab; })
      .catch(() => { audioFetchRef.current = false; });
  }, [enablePageSound]);

  const playPageSound = useCallback(() => {
    if (!soundEnabled || !enablePageSound) return;
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        audioCtxRef.current = new AC();
      }
      const actx = audioCtxRef.current;
      if (actx.state === "suspended") actx.resume();
      if (!soundBufRef.current && audioRawRef.current) {
        actx.decodeAudioData(audioRawRef.current.slice(0))
          .then(d => { soundBufRef.current = d; }).catch(() => {});
      }
      if (soundBufRef.current && actx.state === "running") {
        const src = actx.createBufferSource();
        src.buffer = soundBufRef.current;
        const g = actx.createGain(); g.gain.value = 0.6;
        src.connect(g); g.connect(actx.destination);
        src.start(); return;
      }
      const a = new Audio("/sounds/page-turn.m4a");
      a.volume = 0.6; a.play().catch(() => {});
    } catch {}
  }, [soundEnabled, enablePageSound]);

  // ── PDF Loading ───────────────────────────────────────────────────
  useEffect(() => { loadPdf(); }, [pdfUrl]);

  const loadPdf = async () => {
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.js`;
      const doc = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
      pdfDocRef.current = doc;
      const fp = await doc.getPage(1);
      const vp = fp.getViewport({ scale: 1 });
      setPageNatW(vp.width); setPageNatH(vp.height);
      setTotalPages(doc.numPages);
      setPdfLoaded(true);
      generateThumbnails(doc);
      extractToc(doc);
    } catch (e) { console.error("PDF load error:", e); }
  };

  // ── TOC ───────────────────────────────────────────────────────────
  const extractToc = async (doc: any) => {
    try {
      const outline = await doc.getOutline();
      if (!outline?.length) { setHasToc(false); return; }
      const items = await processOutline(doc, outline, 0);
      setTocItems(items); setHasToc(true);
    } catch { setHasToc(false); }
  };

  const processOutline = async (doc: any, outline: any[], level: number): Promise<TocItem[]> => {
    const items: TocItem[] = [];
    for (const item of outline) {
      let pageNumber = 1;
      try {
        // PDFs use either item.dest (direct) or item.action.dest (action-based)
        let dest = item?.dest ?? item?.action?.dest ?? null;
        if (dest !== null) {
          if (typeof dest === "string") dest = await doc.getDestination(dest);
          if (Array.isArray(dest) && dest[0] != null) {
            pageNumber = (await doc.getPageIndex(dest[0])) + 1;
          }
        }
      } catch {}
      const tocItem: TocItem = { title: item?.title ?? "Untitled", pageNumber, level };
      if (item?.items?.length) tocItem.children = await processOutline(doc, item.items, level + 1);
      items.push(tocItem);
    }
    return items;
  };

  // ── Thumbnail generation ──────────────────────────────────────────
  const generateThumbnails = async (doc: any) => {
    const total = Math.min(doc.numPages ?? 0, 200);
    const thumbs: string[] = [];
    for (let i = 1; i <= total; i++) {
      try {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 0.2 });
        const c = document.createElement("canvas");
        c.width = vp.width; c.height = vp.height;
        const cx = c.getContext("2d");
        if (cx) await page.render({ canvasContext: cx, viewport: vp }).promise;
        thumbs.push(c.toDataURL("image/jpeg", 0.5));
      } catch { thumbs.push(""); }
    }
    setThumbnails(thumbs);
  };

  // ── PDF page → canvas ─────────────────────────────────────────────
  // Renders at max(1.5, zoom)× the display resolution so the canvas
  // stays sharp when the user zooms in via the toolbar.
  const renderPdfPage = useCallback(async (pageNum: number, forceRender = false) => {
    if (!pdfDocRef.current) return;
    if (pageNum < 1 || pageNum > (pdfDocRef.current.numPages ?? 0)) return;
    if (renderedRef.current.has(pageNum) && !forceRender) return;
    const canvas = canvasesRef.current[pageNum - 1];
    if (!canvas) return;
    renderedRef.current.add(pageNum);
    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const dpr       = Math.min(window.devicePixelRatio || 1, 2); // cap DPR at 2×
      const vp        = page.getViewport({ scale: 1 });
      const displayW  = displayWRef.current || 600;
      // Render at enough resolution for the current zoom + fullscreen upscale factor
      // so canvases stay sharp when CSS-zoomed to fill the screen.
      const effectiveZoom = zoomRef.current * Math.max(1, fsZoomRef.current);
      const quality   = Math.min(Math.max(1.5, effectiveZoom), 3);
      const scale     = Math.min((displayW / vp.width) * dpr * quality, 7);
      const sv        = page.getViewport({ scale });
      canvas.width    = Math.round(sv.width);
      canvas.height   = Math.round(sv.height);
      const rc = canvas.getContext("2d");
      if (rc) await page.render({ canvasContext: rc, viewport: sv }).promise;
    } catch { renderedRef.current.delete(pageNum); }
  }, []);

  // ── PageFlip init ─────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfLoaded || pageNatW === 0 || totalPages === 0) return;

    const toolbarH = 100;
    const availH   = (window.innerHeight - toolbarH) * 0.90;
    // Single-page mode (usePortrait:true) can use most of the viewport width.
    // Double-page mode fits two pages side by side.
    const availW   = isDouble ? (window.innerWidth - 60) / 2 : window.innerWidth - 80;
    const scale    = Math.min(availW / pageNatW, availH / pageNatH);
    const dw       = Math.round(pageNatW * scale);
    const dh       = Math.round(pageNatH * scale);

    displayWRef.current = dw;
    displayHRef.current = dh;
    setDisplayW(dw);
    setDisplayH(dh);

    let cancelled = false;

    (async () => {
      const { PageFlip } = await import("page-flip");
      if (cancelled || !bookWrapRef.current) return;

      // Destroy previous instance
      if (pageFlipRef.current) {
        try { pageFlipRef.current.destroy?.(); } catch {}
        pageFlipRef.current = null;
        setBookReady(false);
      }

      // bookWrapRef is the stable React-managed anchor. We create a fresh inner
      // container for PageFlip each init so it starts with a clean DOM state —
      // PageFlip leaves behind styles/classes on its root that break re-init
      // when the usePortrait option changes between single and double mode.
      const wrapOuter = bookWrapRef.current;
      wrapOuter.innerHTML = "";
      wrapOuter.removeAttribute("style");
      const wrap = document.createElement("div");
      wrap.style.cssText = `display:block;width:${isDouble ? dw * 2 : dw}px;height:${dh}px;`;
      wrapOuter.appendChild(wrap);

      canvasesRef.current = new Array(totalPages).fill(null);
      renderedRef.current.clear();

      const pageDivs: HTMLDivElement[] = [];
      for (let i = 0; i < totalPages; i++) {
        const div = document.createElement("div");
        div.style.cssText = `background:#fff;overflow:hidden;position:relative;width:${dw}px;height:${dh}px;`;

        const canvas = document.createElement("canvas");
        canvas.style.cssText = "display:block;width:100%;height:100%;";
        div.appendChild(canvas);
        canvasesRef.current[i] = canvas;

        // Inner-edge gutter shadow only in double-page mode.
        const isInner = isDouble && i > 0 && i < totalPages - 1;
        if (isInner) {
          const isLeftPage = i % 2 === 1;
          const gutter = document.createElement("div");
          gutter.style.cssText = [
            "position:absolute;top:0;bottom:0;pointer-events:none;z-index:1;",
            isLeftPage
              ? "right:0;width:36px;background:linear-gradient(to left,rgba(0,0,0,0.13) 0%,transparent 100%);"
              : "left:0;width:36px;background:linear-gradient(to right,rgba(0,0,0,0.13) 0%,transparent 100%);",
          ].join("");
          div.appendChild(gutter);
        }

        wrap.appendChild(div);
        pageDivs.push(div);
      }

      // One animation frame so the browser computes layout before PageFlip reads it
      await new Promise<void>(resolve => { requestAnimationFrame(() => resolve()); });
      if (cancelled) return;

      const pf = new PageFlip(wrap, {
        width:              dw,
        height:             dh,
        size:               "fixed",
        drawShadow:         true,
        // Single-page portrait mode: instant (1ms) so forward/backward look the same.
        // The backward portrait flip briefly exposes a two-page spread layout — instant
        // transitions eliminate the visual inconsistency.
        flippingTime:       enableAnimatedFlip && isDouble ? 800 : 1,
        usePortrait:        !isDouble, // portrait mode = single-page (advances 1 per flip)
        startZIndex:        0,
        maxShadowOpacity:   0.6,
        showCover:          true,
        mobileScrollSupport: false,
        clickEventForward:  true,
        useMouseEvents:     true,
        swipeDistance:      30,
        showPageCorners:    true,
        disableFlipByClick: false,
      });

      pf.loadFromHTML(pageDivs);
      if (cancelled) { try { pf.destroy?.(); } catch {} return; }
      pageFlipRef.current = pf;

      // Await initial page renders so canvases are never blank on first display
      const preCount = Math.min(isDouble ? 4 : 2, totalPages);
      await Promise.all(Array.from({ length: preCount }, (_, i) => renderPdfPage(i + 1)));
      if (cancelled) return;

      pf.on("flip", (e: any) => {
        if (cancelled) return;
        const idx     = e.data as number;  // 0-based index
        const newPage = idx + 1;
        setCurrentPage(newPage);
        onPageChange?.(newPage);
        playPageSound();
        // Lazily render surrounding pages
        for (let i = Math.max(1, newPage - 2); i <= Math.min(totalPages, newPage + 5); i++) {
          renderPdfPage(i);
        }
      });

      setBookReady(true);

      // Restore page position after a mode-toggle re-init
      const pageToRestore = savedPageRef.current;
      if (pageToRestore > 1 && !cancelled) {
        setTimeout(() => {
          if (!cancelled) goToPageRef.current(pageToRestore);
        }, 150);
      }
    })();

    return () => {
      // Capture current page BEFORE destroying so the next init can restore it
      const currentIdx = pageFlipRef.current?.getCurrentPageIndex?.() ?? 0;
      savedPageRef.current = currentIdx + 1;
      cancelled = true;
      if (pageFlipRef.current) {
        try { pageFlipRef.current.destroy?.(); } catch {}
        pageFlipRef.current = null;
      }
      setBookReady(false);
    };
  }, [pdfLoaded, pageNatW, pageNatH, totalPages, isDouble, enableAnimatedFlip, renderPdfPage, onPageChange, resizeKey]);

  // ── Zoom ─────────────────────────────────────────────────────────
  // CSS zoom is instant (smooth). Re-rendering pages at new resolution
  // is deferred 400ms after the user stops, so dragging the slider or
  // scrolling with Ctrl+wheel feels immediate.
  const reRenderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reRenderTimer.current) clearTimeout(reRenderTimer.current); }, []);

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.max(1, Math.min(3, next));
    setZoom(clamped);
    zoomRef.current = clamped;

    // Debounce the expensive re-render so it only runs when the user pauses
    if (reRenderTimer.current) clearTimeout(reRenderTimer.current);
    reRenderTimer.current = setTimeout(() => {
      const idx = pageFlipRef.current?.getCurrentPageIndex?.() ?? 0;
      for (let i = Math.max(1, idx); i <= Math.min(totalPages, idx + 4); i++) {
        renderedRef.current.delete(i);
        renderPdfPage(i);
      }
    }, 400);
  }, [totalPages, renderPdfPage]);

  // Ctrl + mouse-wheel zooms (standard reader behaviour — Chrome PDF, maps, etc.)
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      applyZoom(Math.max(1, Math.min(3, zoomRef.current + delta)));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  // ── Navigation ────────────────────────────────────────────────────
  const goToPage = useCallback((page: number) => {
    const clamped = Math.max(1, Math.min(page, totalPages));

    const doFlip = () => pageFlipRef.current?.flip?.(clamped - 1, "bottom");

    // The destination pages must be rendered before the flip animation starts,
    // otherwise the turning page shows blank white and looks like no animation.
    const spread = [clamped - 1, clamped, clamped + 1]
      .filter(p => p >= 1 && p <= totalPages);
    const unrendered = spread.filter(p => !renderedRef.current.has(p));

    if (unrendered.length === 0) {
      doFlip();
    } else {
      // Render then flip — typically < 300ms for a single page
      Promise.all(unrendered.map(p => renderPdfPage(p))).then(doFlip);
    }
  }, [totalPages, renderPdfPage]);

  // Keep a stable ref so search / toc callbacks don't need goToPage in deps
  useEffect(() => { goToPageRef.current = goToPage; }, [goToPage]);

  const nextPage = useCallback(() => pageFlipRef.current?.flipNext?.("bottom"), []);
  const prevPage = useCallback(() => pageFlipRef.current?.flipPrev?.("bottom"), []);

  // ── Keyboard ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") setShowSearch(false);
        return;
      }
      switch (e.key) {
        case "ArrowRight": case "PageDown": nextPage(); break;
        case "ArrowLeft":  case "PageUp":   prevPage(); break;
        case "Home": goToPageRef.current(1); break;
        case "End":  goToPageRef.current(totalPages); break;
        case "Escape":
          if (isFullscreen) toggleFullscreen();
          if (showThumbnails) setShowThumbnails(false);
          if (showToc)        setShowToc(false);
          if (showSearch)     setShowSearch(false);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nextPage, prevPage, totalPages, isFullscreen, showThumbnails, showToc, showSearch]);

  // ── Prevent right-click ───────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", h);
    return () => document.removeEventListener("contextmenu", h);
  }, []);

  // ── Re-init PageFlip on resize & fullscreen change ───────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const onResize = () => {
      // Block resize-triggered re-init during any fullscreen transition.
      // fsTransitionRef is set synchronously before requestFullscreen/exitFullscreen.
      // isFullscreenRef catches exits via Escape/F11 where we set the flag late.
      if (document.fullscreenElement || fsTransitionRef.current || isFullscreenRef.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => setResizeKey(k => k + 1), 400);
    };

    window.addEventListener("resize", onResize);
    return () => { clearTimeout(timer); window.removeEventListener("resize", onResize); };
  }, []);

  // ── Search ────────────────────────────────────────────────────────
  const extractPageText = async (p: number) => {
    const cached = pageTextsRef.current.get(p);
    if (cached !== undefined) return cached;
    try {
      const page    = await pdfDocRef.current?.getPage(p);
      const content = await page.getTextContent();
      const text    = content.items.map((i: any) => i.str).join(" ");
      pageTextsRef.current.set(p, text); return text;
    } catch { pageTextsRef.current.set(p, ""); return ""; }
  };

  const performSearch = useCallback(async (query: string) => {
    if (!pdfDocRef.current || !query.trim()) return;
    setIsSearching(true); setSearchPerformed(true);
    const results: { page: number; snippet: string }[] = [];
    const q = query.toLowerCase();
    for (let p = 1; p <= (pdfDocRef.current.numPages ?? 0); p++) {
      const text = await extractPageText(p);
      const lower = text.toLowerCase();
      let idx = lower.indexOf(q);
      while (idx !== -1) {
        const s = Math.max(0, idx - 30), e2 = Math.min(text.length, idx + q.length + 30);
        results.push({ page: p, snippet: (s > 0 ? "…" : "") + text.slice(s, e2) + (e2 < text.length ? "…" : "") });
        idx = lower.indexOf(q, idx + 1);
      }
    }
    setSearchResults(results); setSearchIndex(0); setIsSearching(false);
    if (results.length > 0) goToPageRef.current(results[0].page);
  }, []);

  useEffect(() => { setSearchPerformed(false); setSearchResults([]); setSearchIndex(0); }, [searchQuery]);

  const goToSearchResult = useCallback((idx: number) => {
    if (!searchResults.length) return;
    const w = ((idx % searchResults.length) + searchResults.length) % searchResults.length;
    setSearchIndex(w);
    goToPageRef.current(searchResults[w].page);
  }, [searchResults]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (searchResults.length > 0 && searchPerformed) goToSearchResult(searchIndex + 1);
    else performSearch(searchQuery);
  }, [searchQuery, searchResults, searchPerformed, searchIndex, performSearch, goToSearchResult]);

  // ── Fullscreen ────────────────────────────────────────────────────
  // On enter: re-init PageFlip after the browser has expanded window.innerWidth/Height
  //   to screen size, so the book fills the display rather than being CSS-scaled from
  //   the small iframe dimensions.
  // On exit: wait for the browser's resize event that fires once window.innerWidth/Height
  //   have actually reverted to the iframe/window dimensions, then re-init. Using a
  //   fixed timeout risks re-initing while the viewport is still at screen size, which
  //   leaves the book overflowing the iframe.
  useEffect(() => {
    const onFSChange = () => {
      const entering = !!document.fullscreenElement;
      isFullscreenRef.current = entering;
      fsZoomRef.current = 1;
      setIsFullscreen(entering);

      if (entering) {
        fsTransitionRef.current = false;
        // Defer so the browser finishes expanding the viewport to screen size.
        setTimeout(() => setResizeKey(k => k + 1), 300);
      } else {
        // Keep fsTransitionRef = true (set by toggleFullscreen before exitFullscreen)
        // to block the normal resize handler from firing a competing re-init.
        // Wait for the viewport-resize event — that's the reliable signal that
        // window.innerWidth/Height have reverted to the iframe/window dimensions.
        let done = false;
        const settle = () => {
          if (done) return;
          done = true;
          window.removeEventListener("resize", settle);
          clearTimeout(fallback);
          fsTransitionRef.current = false;
          setResizeKey(k => k + 1);
        };
        window.addEventListener("resize", settle);
        // Fallback in case the resize event doesn't fire (e.g. same-size window).
        const fallback = setTimeout(settle, 600);
      }
    };
    document.addEventListener("fullscreenchange", onFSChange);
    return () => document.removeEventListener("fullscreenchange", onFSChange);
  }, []);

  const toggleFullscreen = () => {
    // Set SYNCHRONOUSLY before requestFullscreen/exitFullscreen so that any
    // resize events the browser fires during the transition are blocked immediately.
    fsTransitionRef.current = true;
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/view/${uuid}`;
    if (navigator.share) navigator.share({ title, url }).catch(() => {});
    else navigator.clipboard?.writeText?.(url);
  };

  const handleJumpPage = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPage, 10);
    if (!isNaN(p)) goToPageRef.current(p);
    setJumpPage("");
  };

  const renderTocItems = (items: TocItem[], depth = 0): React.ReactNode =>
    items.map((item, idx) => {
      const isActive = currentPage === item.pageNumber;
      return (
        <div key={idx}>
          <button
            onClick={() => {
              goToPageRef.current(item.pageNumber);
              // On small screens close the TOC after navigation
              if (window.innerWidth < 768) setShowToc(false);
            }}
            className={`w-full text-left py-2 pr-3 rounded transition-all flex items-start gap-2 group ${
              isActive
                ? "bg-indigo-600/25 text-white"
                : "text-gray-300 hover:bg-gray-700/70 hover:text-white"
            }`}
            style={{ paddingLeft: `${10 + depth * 14}px` }}>
            {/* Dot indicator */}
            <span className={`flex-shrink-0 mt-[5px] w-[6px] h-[6px] rounded-full transition-colors ${
              isActive ? "bg-indigo-400" : "bg-gray-600 group-hover:bg-gray-400"
            }`} />
            <span className={`flex-1 text-left leading-snug ${depth === 0 ? "text-sm font-medium" : "text-xs"}`}>
              {item.title}
            </span>
            <span className={`flex-shrink-0 text-xs tabular-nums ${isActive ? "text-indigo-300" : "text-gray-500"}`}>
              {item.pageNumber}
            </span>
          </button>
          {item.children?.length ? renderTocItems(item.children, depth + 1) : null}
        </div>
      );
    });

  // ── Loading screen ────────────────────────────────────────────────
  if (!pdfLoaded) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-900">
        <Loader2 className="w-10 h-10 animate-spin mb-4" style={{ color: primaryColor }} />
        <p className="text-sm text-gray-400">{branding?.loadingText ?? "Loading your flipbook..."}</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div ref={containerRef}
      className="h-screen flex flex-col bg-gray-900 relative overflow-hidden select-none"
      onCopy={e => e.preventDefault()} onCut={e => e.preventDefault()}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900/95 backdrop-blur border-b border-gray-800 z-20 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {branding?.logoUrl ? (
            <div className="relative w-7 h-7 flex-shrink-0">
              <Image src={branding.logoUrl} alt="Logo" fill className="object-contain" />
            </div>
          ) : (
            <BookOpen className="w-5 h-5 text-white flex-shrink-0" />
          )}
          <span className="text-white text-sm font-medium truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          {enablePageSound && (
            <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
              onClick={() => setSoundEnabled(s => !s)} title={soundEnabled ? "Mute" : "Unmute"}>
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </Button>
          )}
          {enableShare && (
            <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
              onClick={handleShare} title="Share">
              <Share2 className="w-4 h-4" />
            </Button>
          )}
          {enablePrint && (
            <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
              onClick={() => window.print()} title="Print">
              <Printer className="w-4 h-4" />
            </Button>
          )}
          {enableDownload && (
            <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
              onClick={() => {
                const a = document.createElement("a");
                a.href = pdfUrl;
                a.download = `${title}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }} title="Download PDF">
              <Download className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Main ────────────────────────────────────────────────── */}
      <div className="flex-1 flex relative overflow-hidden" style={{ minHeight: 0 }}>

        {/* Thumbnails sidebar */}
        {showThumbnails && (
          <div className="w-48 bg-gray-800 border-r border-gray-700 overflow-y-auto z-10 flex-shrink-0">
            <div className="p-2 space-y-2">
              {thumbnails.map((thumb, i) => (
                <button key={i} onClick={() => goToPageRef.current(i + 1)}
                  className={`w-full rounded-lg overflow-hidden border-2 transition-all ${
                    currentPage === i + 1 ? "border-indigo-500" : "border-transparent hover:border-gray-600"
                  }`}>
                  {thumb
                    ? <img src={thumb} alt={`Page ${i + 1}`} className="w-full" />
                    : <div className="aspect-[3/4] bg-gray-700 flex items-center justify-center text-gray-400 text-xs">Page {i + 1}</div>
                  }
                  <p className="text-xs text-gray-400 py-1">{i + 1}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TOC sidebar — always rendered when open; shows helpful message if PDF has no outline */}
        {showToc && (
          <div className="w-72 bg-gray-900 border-r border-gray-700 z-10 flex-shrink-0 flex flex-col"
            style={{ minHeight: 0 }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4 text-indigo-400" />
                <h3 className="text-white text-sm font-semibold">Table of Contents</h3>
              </div>
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white h-6 w-6"
                onClick={() => setShowToc(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>

            {hasToc ? (
              /* PDF has an outline — render the item tree */
              <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
                {renderTocItems(tocItems)}
              </div>
            ) : pdfLoaded ? (
              /* PDF loaded but no outline found */
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <List className="w-10 h-10 text-gray-600 mb-3" />
                <p className="text-sm text-gray-400 font-medium">No outline found</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  This PDF doesn't have built-in bookmarks. Use the thumbnail panel or page jump to navigate.
                </p>
              </div>
            ) : (
              /* Still loading */
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
              </div>
            )}
          </div>
        )}

        {/* ── Book area ───────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center overflow-hidden relative">

          {/* Arrow nav — kept for accessibility; PageFlip also handles drag/swipe */}
          <button onClick={prevPage} disabled={currentPage <= 1}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white disabled:opacity-20 transition-all">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button onClick={nextPage} disabled={currentPage >= totalPages}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center text-white disabled:opacity-20 transition-all">
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Spine line — sits BELOW the book (z-index 0), only visible in the
              hairline gap between pages; the pages themselves carry the gutter
              shadow so this never overlaps turning content. */}
          {isDouble && bookReady && currentPage > 1 && currentPage < totalPages && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                left: "50%",
                width: "2px",
                transform: "translateX(-50%)",
                zIndex: 0,
                background: "rgba(0,0,0,0.35)",
              }}
            />
          )}

          {/* PageFlip container — shifted to visually center single cover/back pages */}
          {(() => {
            // Common zoom calculation for both modes
            const fsZoom = isFullscreen && displayW > 0 && displayH > 0
              ? Math.min(
                  (window.innerWidth - 40) / (displayW * (isDouble ? 2 : 1)),
                  (window.innerHeight - 96) / displayH,
                  2.5
                )
              : 1;
            const totalZoom = zoom * fsZoom;

            // Always use the same 3-level DOM structure so bookWrapRef is never
            // recreated when toggling modes. Recreating it detaches PageFlip.
            let clipStyle: React.CSSProperties = {};
            let innerStyle: React.CSSProperties;

            if (!isDouble && displayW > 0) {
              // ── SINGLE-PAGE MODE (usePortrait:true — PageFlip renders natively) ──
              // No CSS clipping; PageFlip advances 1 page per flip in portrait mode.
              clipStyle = {};
              innerStyle = {
                transform: `scale(${totalZoom})`,
                transformOrigin: 'center center',
              };
            } else {
              // ── DOUBLE-PAGE MODE ──
              const coverShift = displayW > 0
                ? currentPage === 1 ? -displayW / 2
                  : currentPage === totalPages ? displayW / 2
                  : 0
                : 0;

              innerStyle = {
                transform: `translateX(${coverShift * totalZoom}px) scale(${totalZoom})`,
                transformOrigin: 'center center',
                transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              };
            }

            return (
              <div style={clipStyle}>
                <div style={innerStyle}>
                  <div ref={bookWrapRef} />
                </div>
              </div>
            );
          })()}

          {!bookReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: primaryColor }} />
            </div>
          )}
        </div>

        {/* Search overlay */}
        {showSearch && (
          <div className="absolute top-12 right-4 bg-gray-800 rounded-lg shadow-xl p-3 z-30 w-80">
            <div className="flex items-center gap-1">
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search in document…"
                className="bg-gray-700 border-gray-600 text-white text-sm h-8 flex-1" autoFocus />
              {searchPerformed && searchResults.length > 0 && (
                <>
                  <Button variant="ghost" size="icon" className="text-gray-400 h-8 w-8 flex-shrink-0"
                    onClick={() => goToSearchResult(searchIndex - 1)}>
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-gray-400 h-8 w-8 flex-shrink-0"
                    onClick={() => goToSearchResult(searchIndex + 1)}>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" className="text-gray-400 h-8 w-8 flex-shrink-0"
                onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults([]); setSearchPerformed(false); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            {isSearching && (
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Searching all pages…
              </div>
            )}
            {searchPerformed && !isSearching && (
              <div className="mt-2">
                {searchResults.length === 0
                  ? <p className="text-xs text-gray-500">No results found</p>
                  : <>
                      <p className="text-xs text-gray-400 mb-1">
                        {searchIndex + 1} of {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                      </p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {searchResults.map((r, i) => (
                          <button key={i} onClick={() => goToSearchResult(i)}
                            className={`w-full text-left text-xs px-2 py-1.5 rounded transition-colors ${
                              i === searchIndex ? "bg-indigo-600/40 text-white" : "text-gray-300 hover:bg-gray-700"
                            }`}>
                            <span className="text-gray-500 mr-1">p.{r.page}</span>{r.snippet}
                          </button>
                        ))}
                      </div>
                    </>
                }
              </div>
            )}
            {!searchPerformed && !isSearching && (
              <p className="text-xs text-gray-500 mt-2">Press Enter to search</p>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom toolbar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900/95 backdrop-blur border-t border-gray-800 z-20 flex-shrink-0">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon"
            className={`h-8 w-8 ${showThumbnails ? "text-white bg-gray-700" : "text-gray-300 hover:text-white"}`}
            onClick={() => { setShowThumbnails(s => !s); if (!showThumbnails) setShowToc(false); }}
            title="Thumbnails">
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon"
            className={`h-8 w-8 ${showToc ? "text-white bg-gray-700" : "text-gray-300 hover:text-white"}`}
            onClick={() => { setShowToc(s => !s); if (!showToc) setShowThumbnails(false); }}
            title={hasToc ? "Table of Contents" : "Table of Contents (none in PDF)"}>
            <List className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon"
            className="text-gray-300 hover:text-white h-8 w-8"
            onClick={() => setShowSearch(s => !s)} title="Search">
            <Search className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
            onClick={() => goToPageRef.current(1)} title="First page">
            <ChevronFirst className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
            onClick={prevPage} disabled={currentPage <= 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <form onSubmit={handleJumpPage} className="flex items-center gap-1">
            <Input value={jumpPage} onChange={e => setJumpPage(e.target.value)}
              placeholder={String(currentPage)}
              className="w-12 h-7 text-center bg-gray-800 border-gray-700 text-white text-xs px-1" />
            <span className="text-gray-400 text-xs">/ {totalPages}</span>
          </form>
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
            onClick={nextPage} disabled={currentPage >= totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
            onClick={() => goToPageRef.current(totalPages)} title="Last page">
            <ChevronLast className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom slider — drag left/right or use − / + buttons */}
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
            onClick={() => applyZoom(Math.max(1, zoom - 0.25))} title="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <input
            type="range" min={100} max={300} step={5}
            value={Math.round(zoom * 100)}
            onChange={e => applyZoom(Number(e.target.value) / 100)}
            className="w-24 h-1 accent-indigo-500 cursor-pointer"
            title={`Zoom: ${Math.round(zoom * 100)}%`}
          />
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
            onClick={() => applyZoom(Math.min(3, zoom + 0.25))} title="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <button onClick={() => applyZoom(1)}
            className="text-gray-400 hover:text-white text-xs min-w-[3rem] text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </button>
          <div className="w-px h-5 bg-gray-700 mx-1" />
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
            onClick={() => setIsDouble(d => !d)}
            title={isDouble ? "Single page" : "Double page"}>
            <BookOpen className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-gray-300 hover:text-white h-8 w-8"
            onClick={toggleFullscreen} title="Fullscreen">
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
