import { localDateStamp, toBase64 } from "@repo/util";
import type { PDFFont, PDFPage } from "pdf-lib";

export const RECOVERY_KEY_GROUPS = 4;
/** Characters per group of a recovery key (44 base64 characters). */
export const RECOVERY_KEY_GROUP_LENGTH = 11;

/**
 * The recovery key as shown and printed: base64 in four groups, easier to
 * transcribe and compare. `parseRecoveryKey` ignores the spaces between them.
 */
export function recoveryKeyChunks(recoveryKey: Uint8Array, parts = RECOVERY_KEY_GROUPS): string[] {
  const value = toBase64(recoveryKey);
  const size = Math.ceil(value.length / parts);
  return Array.from({ length: parts }, (_, i) => value.slice(i * size, (i + 1) * size)).filter(
    Boolean,
  );
}

export type EmergencyKitInput = {
  recoveryKey: Uint8Array;
  /** The server account; absent for a local vault (no server, no email). */
  account?: { email: string; serverUrl: string };
  /** Where the web app is opened, when it has an address of its own. */
  appUrl?: string;
  /** The profile's display name, if it has one. */
  name?: string;
  createdAt?: Date;
};

export type EmergencyKitFile = { fileName: string; bytes: Uint8Array<ArrayBuffer> };

/** `passmgr-emergency-kit-2026-10-11.pdf`: the local date. */
export function emergencyKitFileName(now: Date = new Date()): string {
  return `passmgr-emergency-kit-${localDateStamp(now)}.pdf`;
}

// A4 in PDF points.
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN;

/**
 * The standard fonts only encode WinAnsi (Latin-1 here); a character outside it
 * would make pdf-lib throw. Only a display name can hold one: emails are ASCII
 * (`emailSchema`), URLs and the base64 key too.
 */
function printable(text: string): string {
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The emergency kit: a one-page, printable PDF with what's needed to get back
 * into the vault: the email and server (an account), a field to write the
 * master password in by hand, and the recovery key. Built on the device only;
 * the recovery key never reaches the server. The caller wipes `bytes` once it
 * has handed them over.
 */
export async function createEmergencyKit(input: EmergencyKitInput): Promise<EmergencyKitFile> {
  // Read before the first await: the caller may wipe the key while the PDF is built.
  const key = recoveryKeyChunks(input.recoveryKey).join("  ");
  // Loaded on demand: only needed the moment a recovery key is issued.
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const createdAt = input.createdAt ?? new Date();

  const doc = await PDFDocument.create();
  // Nothing personal in the metadata: file managers and previews show it.
  doc.setTitle("passmgr Emergency Kit");
  doc.setCreator("passmgr");
  doc.setProducer("passmgr");
  doc.setCreationDate(createdAt);
  doc.setModificationDate(createdAt);

  const page: PDFPage = doc.addPage([PAGE.width, PAGE.height]);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.CourierBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const muted = rgb(0.42, 0.42, 0.46);
  const rule = rgb(0.82, 0.82, 0.85);

  let y = PAGE.height - MARGIN;

  const text = (value: string, opts: { font?: PDFFont; size?: number; muted?: boolean } = {}) => {
    const font = opts.font ?? sans;
    const size = opts.size ?? 10.5;
    for (const line of wrap(printable(value), font, size, CONTENT_WIDTH)) {
      y -= size * 1.35;
      page.drawText(line, { x: MARGIN, y, size, font, color: opts.muted ? muted : ink });
    }
  };

  const heading = (value: string) => {
    y -= 26;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE.width - MARGIN, y },
      thickness: 0.75,
      color: rule,
    });
    y -= 8;
    text(value.toUpperCase(), { font: bold, size: 9, muted: true });
    y -= 4;
  };

  const field = (label: string, value: string) => {
    y -= 6;
    text(label, { size: 9, muted: true });
    text(value, { font: bold, size: 12 });
  };

  text("passmgr Emergency Kit", { font: bold, size: 24 });
  y -= 4;
  text(`Created ${localDateStamp(createdAt)}`, { size: 10, muted: true });
  y -= 6;
  text(
    "Print this page or keep it offline, somewhere safe: a drawer at home, a safe deposit box. " +
      "It holds what you need to get back into your vault if you forget your password.",
  );

  heading(input.account ? "Account" : "Vault");
  if (input.account) {
    field("Email", input.account.email);
    field("Server", input.account.serverUrl);
  } else {
    text("A vault on this device only: no account, no server. Recovery works on that device.");
  }
  if (input.appUrl) field("Open passmgr at", input.appUrl);
  if (input.name) field("Name", input.name);

  heading("Password");
  text("Write it here by hand if you want to. Never type it into a file or a photo.", {
    muted: true,
  });
  y -= 44;
  page.drawRectangle({
    x: MARGIN,
    y,
    width: CONTENT_WIDTH,
    height: 34,
    borderColor: rule,
    borderWidth: 1,
  });

  heading("Recovery key");
  text(
    input.account
      ? "Resets your password. Anyone who has it (with your email) can take over your " +
          "vault: keep it as safe as the password itself."
      : "Resets your password. Anyone who has it (with the device) can open your " +
          "vault: keep it as safe as the password itself.",
    { muted: true },
  );
  y -= 10;
  const keyBox = 52;
  page.drawRectangle({
    x: MARGIN,
    y: y - keyBox,
    width: CONTENT_WIDTH,
    height: keyBox,
    color: rgb(0.96, 0.96, 0.97),
    borderColor: rule,
    borderWidth: 1,
  });
  const keySize = 15;
  page.drawText(key, {
    x: MARGIN + (CONTENT_WIDTH - mono.widthOfTextAtSize(key, keySize)) / 2,
    y: y - keyBox / 2 - keySize / 3,
    size: keySize,
    font: mono,
    color: ink,
  });
  y -= keyBox;
  y -= 4;
  text("Spaces don't matter when you type it in. Letters are case-sensitive.", {
    size: 9,
    muted: true,
  });

  heading("Forgot your password?");
  text(
    input.account
      ? '1. Open passmgr and choose "Forgot password?" on the sign-in page.'
      : '1. Open passmgr on the device that holds the vault and choose "Forgot password?".',
  );
  text(
    input.account
      ? "2. Enter your email and the recovery key above, then a new password."
      : "2. Enter the recovery key above, then a new password.",
  );
  text(
    "3. You get a new recovery key and this one stops working: print a new emergency kit " +
      "and destroy this page.",
  );

  y -= 18;
  text(
    "Generated on your device. The recovery key was never sent to the server; " +
      "passmgr cannot recover your vault without it.",
    { size: 9, muted: true },
  );

  // pdf-lib types its output loosely; it is a plain ArrayBuffer (a Blob part on web).
  const bytes = (await doc.save()) as Uint8Array<ArrayBuffer>;
  return { fileName: emergencyKitFileName(createdAt), bytes };
}
