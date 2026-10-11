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
import { Upload, Camera, Images } from "lucide-react";
import { canTakePhoto, takePhoto, wasDenied } from "@/lib/camera";
import { toast } from "sonner";

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

  // Inside the app, a bill is almost always photographed rather than found in
  // a folder, so the camera is offered first.
  const photoAllowed = canTakePhoto && /image|\*/.test(accept);

  const shoot = async (e, source) => {
    e.stopPropagation();          // not a tap on the drop zone behind it
    if (disabled) return;
    try {
      const f = await takePhoto(source);
      if (f) onFile(f);
    } catch (err) {
      if (wasDenied(err)) {
        toast.error("Camera access is off — turn it on in Settings › BillingsEasy");
      }
      // Backing out of the camera throws too; that needs no message.
    }
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

      {photoAllowed && !file && !dragging && (
        <div className="flex gap-2 mb-1">
          <button type="button" onClick={(e) => shoot(e, "camera")} disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold px-3.5 py-2 active:bg-blue-700"
            data-testid="dropzone-camera">
            <Camera className="h-4 w-4" /> Take photo
          </button>
          <button type="button" onClick={(e) => shoot(e, "photos")} disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 text-sm font-medium px-3.5 py-2"
            data-testid="dropzone-photos">
            <Images className="h-4 w-4" /> Photos
          </button>
        </div>
      )}

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
