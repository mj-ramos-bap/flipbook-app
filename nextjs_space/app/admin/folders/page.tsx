"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { FolderOpen, Pencil, Trash2, BookOpen, Loader2, Check, X, FolderPlus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Folder {
  id: string;
  name: string;
  createdAt: string;
  _count: { flipbooks: number };
}

export default function FoldersPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchFolders(); }, []);

  const fetchFolders = async () => {
    try {
      const res = await fetch("/api/folders");
      const data = await res.json();
      setFolders(data?.folders ?? []);
    } catch {}
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setFolders((prev) => [...prev, { ...data.folder, _count: { flipbooks: 0 } }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setCreating(false);
      toast.success(`Folder "${name}" created`);
    } catch {
      toast.error("Failed to create folder");
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      setFolders((prev) => prev.map((f) => f.id === id ? { ...f, name } : f).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
      toast.success("Folder renamed");
    } catch {
      toast.error("Failed to rename folder");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete folder "${name}"? All flipbooks inside will be unassigned (not deleted).`)) return;
    try {
      const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setFolders((prev) => prev.filter((f) => f.id !== id));
      toast.success("Folder deleted");
    } catch {
      toast.error("Failed to delete folder");
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
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Folders</h2>
          <p className="text-muted-foreground mt-1">Organise your flipbooks into folders</p>
        </div>
        {!creating && (
          <Button
            onClick={() => { setCreating(true); setNewName(""); }}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shrink-0"
          >
            <FolderPlus className="w-4 h-4 mr-2" /> New Folder
          </Button>
        )}
      </div>

      {/* Create folder form */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <Card className="border-indigo-200 border-2 shadow-md max-w-lg">
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-3">New folder name</p>
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                    placeholder="e.g. Training Guides"
                    className="flex-1"
                  />
                  <Button onClick={handleCreate} disabled={!newName.trim() || saving} className="bg-indigo-600 hover:bg-indigo-700">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </Button>
                  <Button variant="outline" onClick={() => setCreating(false)} disabled={saving}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {folders.length === 0 && !creating ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center mb-5">
            <FolderOpen className="w-10 h-10 text-indigo-500" />
          </div>
          <h3 className="font-display text-xl font-semibold mb-2">No folders yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Create a folder to organise your flipbooks. You can assign a folder when uploading a PDF.
          </p>
          <Button
            onClick={() => { setCreating(true); setNewName(""); }}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
          >
            <FolderPlus className="w-4 h-4 mr-2" /> Create First Folder
          </Button>
        </div>
      ) : (
        /* Folder grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {folders.map((folder, i) => (
            <motion.div key={folder.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow h-full">
                <CardContent className="p-5 flex flex-col h-full">
                  {editingId === folder.id ? (
                    <div className="flex flex-col gap-3 flex-1">
                      <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                        <FolderOpen className="w-6 h-6 text-indigo-600" />
                      </div>
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(folder.id); if (e.key === "Escape") setEditingId(null); }}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleRename(folder.id)} disabled={!editName.trim() || saving}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1.5" /> Save</>}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={saving}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                          <FolderOpen className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => { setEditingId(folder.id); setEditName(folder.name); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(folder.id, folder.name)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="font-semibold text-sm truncate mb-1">{folder.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        {folder._count?.flipbooks ?? 0} flipbook{(folder._count?.flipbooks ?? 0) !== 1 ? "s" : ""}
                      </p>
                      <div className="mt-auto pt-4 space-y-2 border-t border-gray-100">
                        <Link href={`/admin/folders/${folder.id}`} className="block">
                          <Button variant="outline" size="sm" className="w-full text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">
                            <BookOpen className="w-3 h-3 mr-1.5" /> View Books <ChevronRight className="w-3 h-3 ml-auto" />
                          </Button>
                        </Link>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="flex-1 text-xs"
                            onClick={() => { setEditingId(folder.id); setEditName(folder.name); }}>
                            <Pencil className="w-3 h-3 mr-1.5" /> Rename
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={() => handleDelete(folder.id, folder.name)}>
                            <Trash2 className="w-3 h-3 mr-1.5" /> Delete
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
