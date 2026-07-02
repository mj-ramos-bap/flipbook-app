"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import {
  BookOpen, ArrowLeft, Loader2, Copy, ExternalLink, Settings,
  Trash2, FolderOpen, X, LayoutGrid, List, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface FlipbookItem {
  id: string;
  uuid: string;
  title: string;
  pageCount: number;
  status: string;
  thumbnailUrl: string | null;
  folderId: string | null;
  _count: { views: number };
}

interface Folder {
  id: string;
  name: string;
  _count: { flipbooks: number };
}

export default function FolderDetailPage() {
  const params = useParams();
  const folderId = params?.id as string;

  const [folder, setFolder] = useState<Folder | null>(null);
  const [flipbooks, setFlipbooks] = useState<FlipbookItem[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // ── Move modal state ─────────────────────────────────────────────
  const [moveTarget, setMoveTarget] = useState<FlipbookItem | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (!folderId) return;
    const fetchData = async () => {
      try {
        const [foldersRes, flipbooksRes] = await Promise.all([
          fetch("/api/folders"),
          fetch(`/api/flipbooks?folderId=${folderId}`),
        ]);
        const foldersData = await foldersRes.json();
        const flipbooksData = await flipbooksRes.json();
        const folders: Folder[] = foldersData?.folders ?? [];
        setAllFolders(folders);
        setFolder(folders.find(f => f.id === folderId) ?? null);
        setFlipbooks(flipbooksData?.flipbooks ?? []);
      } catch {}
      finally { setLoading(false); }
    };
    fetchData();
  }, [folderId]);

  const copyLink = (uuid: string) => {
    const url = `${window?.location?.origin ?? ""}/view/${uuid}`;
    navigator?.clipboard?.writeText?.(url);
    toast.success("Link copied to clipboard");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this flipbook?")) return;
    try {
      const res = await fetch(`/api/flipbooks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setFlipbooks(prev => prev.filter(f => f.id !== id));
      toast.success("Flipbook deleted");
    } catch {
      toast.error("Failed to delete flipbook");
    }
  };

  const handleMove = async (targetFolderId: string | null) => {
    if (!moveTarget) return;
    setIsMoving(true);
    try {
      const res = await fetch(`/api/flipbooks/${moveTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: targetFolderId }),
      });
      if (!res.ok) throw new Error("Failed");
      // Remove from this folder's list since it moved away
      setFlipbooks(prev => prev.filter(f => f.id !== moveTarget.id));
      const folderName = targetFolderId
        ? allFolders.find(f => f.id === targetFolderId)?.name ?? "folder"
        : "No Folder";
      toast.success(`Moved to "${folderName}"`);
      setMoveTarget(null);
    } catch {
      toast.error("Failed to move flipbook");
    } finally {
      setIsMoving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/admin/folders">
          <Button variant="ghost" size="icon" className="mt-0.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <FolderOpen className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight">{folder?.name ?? "Folder"}</h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                {flipbooks.length} flipbook{flipbooks.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* View toggle */}
      {flipbooks.length > 0 && (
        <div className="flex justify-end">
          <div className="flex items-center gap-1 border rounded-lg p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
              title="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Book grid / list */}
      {flipbooks.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-12 text-center">
            <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No flipbooks in this folder yet.</p>
            <p className="text-sm text-muted-foreground mt-1">Upload a PDF or move an existing book here from the dashboard.</p>
            <Link href="/admin" className="mt-4 inline-block">
              <Button variant="outline" className="mt-2"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {flipbooks.map((fb, i) => (
            <motion.div key={fb.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="border-0 shadow-md hover:shadow-lg transition-shadow overflow-hidden">
                <div className="relative aspect-[4/3] bg-gradient-to-br from-indigo-100 to-purple-100">
                  {fb.thumbnailUrl ? (
                    <Image src={fb.thumbnailUrl} alt={fb.title ?? "Flipbook"} fill className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <BookOpen className="w-16 h-16 text-indigo-300" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      fb.status === "ready" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                    }`}>{fb.status === "ready" ? "Published" : "Processing"}</span>
                  </div>
                </div>
                <CardContent className="p-4">
                  <h4 className="font-semibold text-base truncate">{fb.title ?? "Untitled"}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{fb.pageCount ?? 0} pages · {fb._count?.views ?? 0} views</p>
                  <div className="grid grid-cols-3 gap-1.5 mt-3">
                    <Button variant="outline" size="sm" className="w-full" onClick={() => copyLink(fb.uuid)}>
                      <Copy className="w-3 h-3 mr-1.5" /> Link
                    </Button>
                    <Link href={`/view/${fb.uuid}`} target="_blank" className="contents">
                      <Button variant="outline" size="sm" className="w-full"><ExternalLink className="w-3 h-3 mr-1.5" /> View</Button>
                    </Link>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setMoveTarget(fb)}>
                      <FolderOpen className="w-3 h-3 mr-1.5" /> Move
                    </Button>
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <Link href={`/admin/flipbooks/${fb.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full"><Settings className="w-3 h-3 mr-1.5" /> Settings</Button>
                    </Link>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(fb.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200">
                      <Trash2 className="w-3 h-3 mr-1.5" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="divide-y">
            {flipbooks.map((fb, i) => (
              <motion.div key={fb.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors"
              >
                <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-100 to-purple-100">
                  {fb.thumbnailUrl ? (
                    <Image src={fb.thumbnailUrl} alt={fb.title ?? "Flipbook"} fill className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <BookOpen className="w-7 h-7 text-indigo-300" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-sm truncate">{fb.title ?? "Untitled"}</h4>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">{fb.pageCount ?? 0} pages</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Eye className="w-3 h-3" />{fb._count?.views ?? 0} views</span>
                  </div>
                </div>
                <span className={`hidden sm:inline-flex px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                  fb.status === "ready" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                }`}>{fb.status === "ready" ? "Published" : "Processing"}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={() => copyLink(fb.uuid)}>
                    <Copy className="w-3 h-3 mr-1.5" /> Link
                  </Button>
                  <Link href={`/view/${fb.uuid}`} target="_blank">
                    <Button variant="outline" size="sm"><ExternalLink className="w-3 h-3 mr-1.5" /> View</Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => setMoveTarget(fb)}>
                    <FolderOpen className="w-3 h-3 mr-1.5" /> Move
                  </Button>
                  <Link href={`/admin/flipbooks/${fb.id}`}>
                    <Button variant="outline" size="sm"><Settings className="w-3 h-3 mr-1.5" /> Settings</Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(fb.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200">
                    <Trash2 className="w-3 h-3 mr-1.5" /> Delete
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Move to Folder modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {moveTarget && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isMoving && setMoveTarget(null)} />
            <motion.div
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", duration: 0.3 }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-indigo-600" /> Move to Folder
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-[240px]">{moveTarget.title}</p>
                </div>
                <button onClick={() => !isMoving && setMoveTarget(null)} disabled={isMoving}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-40 mt-0.5">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto">
                {/* No Folder */}
                <button
                  onClick={() => handleMove(null)}
                  disabled={isMoving || moveTarget.folderId === null}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition-colors border ${
                    moveTarget.folderId === null
                      ? "bg-gray-50 border-gray-200 text-gray-400 cursor-default"
                      : "border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700"
                  }`}
                >
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-4 h-4 text-gray-400" />
                  </div>
                  <span className="flex-1 font-medium">No Folder</span>
                  {moveTarget.folderId === null && <span className="text-xs text-gray-400 flex-shrink-0">Current</span>}
                </button>

                {allFolders.map(f => {
                  const isCurrent = moveTarget.folderId === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => handleMove(f.id)}
                      disabled={isMoving || isCurrent}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition-colors border ${
                        isCurrent
                          ? "bg-indigo-50 border-indigo-200 text-indigo-700 cursor-default"
                          : "border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isCurrent ? "bg-indigo-100" : "bg-indigo-50"}`}>
                        <FolderOpen className={`w-4 h-4 ${isCurrent ? "text-indigo-600" : "text-indigo-400"}`} />
                      </div>
                      <span className="flex-1 font-medium">{f.name}</span>
                      {isCurrent && <span className="text-xs text-indigo-400 flex-shrink-0">Current</span>}
                    </button>
                  );
                })}
              </div>

              {isMoving && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-1">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Moving...
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
