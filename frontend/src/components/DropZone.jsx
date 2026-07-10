/**
 * Reusable drag-and-drop + click-to-browse file upload zone.
 *
 * Props:
 *   accept      — HTML accept string, e.g. "image/*,.pdf"
 *   onFile      — callback(File) called when a file is selected/dropped
 *   file        — currently selected File (optional, for display)
 *   label       — primary label text
 *   hint        — secondary hint text (e.g. "PDF, JPG or PNG — max 10 MB")
 *   icon        — optional Lucide icon component
 *   disabled    — disable interaction
 *   className   — extra wrapper classes
 *   compact     — smaller variant (used inside dialogs)
 */
import { useRef, useState } from "react";
import { Upload } from "lucide-react";

export default function DropZone({
  accept = "*",
  onFile,
  file = null,
  label = "Click or drag & drop to upload",
  hint = "",
  icon: Icon = Upload,
  disabled = false,
  className = "",
  compact = false,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  };

  const handleDragLeave = (e) => {
    // only clear if leaving the zone itself (not a child)
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  };

  const handleChange = (e) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    // reset so same file can be re-selected
    e.target.value = "";
  };

  const py = compact ? "py-4" : "py-8";
  const iconSize = compact ? "h-7 w-7" : "h-10 w-10";
  const textSize = compact ? "text-sm" : "text-base";

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={[
        "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer select-none transition-colors",
        px, py,
        dragging
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
          : file
          ? "border-green-400 bg-green-50 dark:bg-green-950/20"
          : "border-muted-foreground/30 bg-muted/20 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/20",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ].join(" ")}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />

      {dragging ? (
        <>
          <Upload className={`${iconSize} text-blue-500`} />
          <p className={`${textSize} font-semibold text-blue-600`}>Drop it here!</p>
        </>
      ) : file ? (
        <>
          <Icon className={`${iconSize} text-green-500`} />
          <p className={`${textSize} font-semibold text-green-700 dark:text-green-400 truncate max-w-full px-2`}>
            {file.name}
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          <p className="text-xs text-muted-foreground">Click to change</p>
        </>
      ) : (
        <>
          <Icon className={`${iconSize} text-muted-foreground/60`} />
          <div className="text-center">
            <p className={`${textSize} font-medium text-muted-foreground`}>
              {label}
            </p>
            {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
          </div>
          <p className="text-xs text-muted-foreground/60">or drag &amp; drop here</p>
        </>
      )}
    </div>
  );
}

// px is separate to avoid Tailwind purge issues
const px = "px-6";
