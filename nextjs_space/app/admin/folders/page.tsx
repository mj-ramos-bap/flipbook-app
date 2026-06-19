"use client";
import { useState, useEffect } from "react";
import { FolderOpen, Plus, Pencil, Trash2, BookOpen, Loader2, Check, X, FolderPlus } from "lucide-react";
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
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Folders</h2>
          <p className="text-muted-foreground mt-1">Organise your flipbooks into folders</p>
        </div>
        {!creating && (
          <Button
            onClick={() => { setCreating(true); setNewName(""); }}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
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
            <Card className="border-indigo-200 border-2 shadow-md">
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

      {/* Folder list */}
      {folders.length === 0 && !creating ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
            <FolderOpen className="w-8 h-8 text-indigo-500" />
          </div>
          <h3 className="font-display text-lg font-semibold mb-1">No folders yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs mb-5">
            Create a folder to organise your flipbooks. You can assign a folder when uploading a PDF.
          </p>
          <Button onClick={() => { setCreating(true); setNewName(""); }}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
            <FolderPlus className="w-4 h-4 mr-2" /> Create First Folder
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {folders.map((folder, i) => (
            <motion.div key={folder.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="w-5 h-5 text-indigo-600" />
                  </div>

                  {editingId === folder.id ? (
                    <div className="flex-1 flex gap-2">
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(folder.id); if (e.key === "Escape") setEditingId(null); }}
                        className="flex-1"
                      />
                      <Button size="sm" onClick={() => handleRename(folder.id)} disabled={!editName.trim() || saving}
                        className="bg-indigo-600 hover:bg-indigo-700">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={saving}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{folder.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <BookOpen className="w-3 h-3" />
                          {folder._count?.flipbooks ?? 0} flipbook{(folder._count?.flipbooks ?? 0) !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Button variant="outline" size="sm" onClick={() => { setEditingId(folder.id); setEditName(folder.name); }}>
                          <Pencil className="w-3 h-3 mr-1.5" /> Rename
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleDelete(folder.id, folder.name)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200">
                          <Trash2 className="w-3 h-3 mr-1.5" /> Delete
                        </Button>
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
