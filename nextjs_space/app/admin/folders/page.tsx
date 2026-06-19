import { FolderOpen } from "lucide-react";

export default function FoldersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Folders</h2>
        <p className="text-muted-foreground mt-1">Organise your flipbooks into folders</p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-4">
          <FolderOpen className="w-8 h-8 text-indigo-500" />
        </div>
        <h3 className="font-display text-lg font-semibold mb-1">Folders coming soon</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Create folders to organise your flipbooks into collections and share them as a group.
        </p>
      </div>
    </div>
  );
}
