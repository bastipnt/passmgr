import { type DragEvent, useEffect, useRef, useState } from "react";

function carriesFiles(event: { dataTransfer: DataTransfer | null }) {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/** A file dropped beside the zone would otherwise open in the tab, leaving the app (and locking it). */
function blockStrayFileDrop(event: globalThis.DragEvent) {
  if (carriesFiles(event)) event.preventDefault();
}

/**
 * Drag-and-drop of one file onto an element: spread `dropProps` on it, and
 * `dragOver` (also `data-drag-over`) is set while a file is held over it.
 * Drags that carry no file (text, a link) are left alone. While mounted, a
 * file dropped anywhere else on the page does nothing.
 */
export function useFileDrop(onFile: (file: File) => void, { disabled = false } = {}) {
  const [dragOver, setDragOver] = useState(false);
  // Enter / leave fire for every child crossed (and Safari gives leave no relatedTarget): count them.
  const depth = useRef(0);

  useEffect(() => {
    window.addEventListener("dragover", blockStrayFileDrop);
    window.addEventListener("drop", blockStrayFileDrop);
    return () => {
      window.removeEventListener("dragover", blockStrayFileDrop);
      window.removeEventListener("drop", blockStrayFileDrop);
    };
  }, []);

  return {
    dragOver,
    dropProps: {
      "data-drag-over": dragOver || undefined,
      onDragEnter: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        depth.current += 1;
        if (!disabled) setDragOver(true);
      },
      onDragOver: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        if (!disabled) setDragOver(true);
      },
      onDragLeave: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragOver(false);
      },
      onDrop: (event: DragEvent) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        depth.current = 0;
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file && !disabled) onFile(file);
      },
    },
  };
}
