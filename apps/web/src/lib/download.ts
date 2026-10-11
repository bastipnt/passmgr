/** Hand `content` to the browser's download as `fileName`. */
export function downloadFile(fileName: string, content: BlobPart, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Not right after the click: some browsers (older Safari) cancel a download
  // whose URL is revoked before it started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
