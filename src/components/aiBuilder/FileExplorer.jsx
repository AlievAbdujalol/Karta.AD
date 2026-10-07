import { useState } from 'react';
import { FileText, FolderClosed, Plus, Trash2, Pencil } from 'lucide-react';
import { buildTree } from '@/lib/projectFiles';

/**
 * Дерево файлов проекта: открыть, создать, переименовать, удалить.
 */
export default function FileExplorer({
  files, activePath, onOpen, onCreate, onRename, onDelete,
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const tree = buildTree(Object.keys(files || {}));

  const submitCreate = () => {
    const v = newName.trim();
    if (v) onCreate?.(v);
    setNewName('');
    setCreating(false);
  };

  const submitRename = () => {
    if (renaming && renameValue.trim()) onRename?.(renaming, renameValue.trim());
    setRenaming(null);
    setRenameValue('');
  };

  const renderNodes = (nodes, depth = 0) => nodes.map((n) => (
    <div key={n.path}>
      {n.children ? (
        <div className="px-2 py-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500 flex items-center gap-1.5" style={{ paddingLeft: 8 + depth * 10 }}>
          <FolderClosed size={12} className="text-amber-500" />
          <span className="truncate">{n.name}</span>
        </div>
      ) : (
        <div
          className={`group flex items-center gap-1.5 pr-1 py-1.5 rounded-lg cursor-pointer text-[12px] font-semibold ${
            activePath === n.path
              ? 'bg-violet-600/20 text-white'
              : 'text-slate-300 hover:bg-slate-800'
          }`}
          style={{ paddingLeft: 8 + depth * 10 }}
          onClick={() => onOpen?.(n.path)}
        >
          <FileText size={12} className="shrink-0 text-slate-500" />
          {renaming === n.path ? (
            <input
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-slate-900 border border-violet-500 text-[12px] text-white outline-none"
            />
          ) : (
            <span className="flex-1 min-w-0 truncate">{n.name}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setRenaming(n.path); setRenameValue(n.name); }}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-slate-200"
            title="Переименовать"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(n.path); }}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400"
            title="Удалить"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
      {n.children && renderNodes(n.children, depth + 1)}
    </div>
  ));

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-2 px-2 py-2 border-b border-slate-800">
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-400 flex-1">
          Файлы · {Object.keys(files || {}).length}
        </span>
        <button onClick={() => setCreating((v) => !v)} title="Новый файл"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
          <Plus size={13} />
        </button>
      </div>
      {creating && (
        <div className="p-2 flex gap-1.5">
          <input
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder="style.css"
            className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-[12px] text-white outline-none focus:border-violet-500"
          />
          <button onClick={submitCreate} className="px-2.5 rounded-lg bg-violet-600 text-white text-xs font-bold">OK</button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar-ui p-1.5">
        {Object.keys(files || {}).length === 0 && (
          <p className="px-2 py-3 text-[11px] text-slate-500">Файлов нет — создай первый кнопкой +</p>
        )}
        {renderNodes(tree)}
      </div>
    </div>
  );
}
