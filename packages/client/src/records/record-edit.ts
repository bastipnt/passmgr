import { sshPublicKeyFromPrivateKey } from "@repo/crypto";
import type { RecordData, RecordFormValues, RecordOfType, RecordType } from "@repo/schema";
import { normalizeWebsiteUrl } from "@repo/util";
import { normalizeCardNumber } from "./card";

/**
 * Cleans up what a form hands back before it is saved: blank website rows go,
 * URLs are normalised, a card number keeps its digits only (the view groups
 * them again; text that isn't a card number is kept as written), and an SSH key with a private key but no public key gets the
 * public key from the key file.
 */
function normalizeFormValues<T extends RecordType>(
  type: T,
  values: RecordFormValues<T>,
): RecordFormValues<T> {
  // Each branch only touches its own type's fields.
  const v = values as RecordFormValues;
  switch (type) {
    case "login": {
      const login = v as RecordFormValues<"login">;
      return {
        ...login,
        websites: login.websites
          ?.map(({ value, ...rest }) => ({ ...rest, value: value.trim() }))
          .filter(({ value }) => value !== "")
          .map(({ value, ...rest }) => ({ ...rest, value: normalizeWebsiteUrl(value) })),
      } as RecordFormValues<T>;
    }
    case "card": {
      const card = v as RecordFormValues<"card">;
      return { ...card, number: normalizeCardNumber(card.number) } as RecordFormValues<T>;
    }
    case "ssh_key": {
      const key = v as RecordFormValues<"ssh_key">;
      if (key.publicKey?.trim() || !key.privateKey) return values;
      return {
        ...key,
        publicKey: sshPublicKeyFromPrivateKey(key.privateKey) ?? key.publicKey,
      } as RecordFormValues<T>;
    }
    default:
      return values;
  }
}

/**
 * The record data to save from a form of `type`. The forms only hold some of
 * a record's fields, so the ones they don't edit (favourite, tags,
 * attachments) are carried over from the current version. A record keeps its
 * type: saving it through another type's form would drop its fields.
 */
export function recordFromForm<T extends RecordType>(
  type: T,
  values: RecordFormValues<T>,
  current?: RecordData,
): RecordOfType<T> {
  if (current && current.type !== type) {
    throw new Error(`A ${current.type} record can't be saved through the ${type} form`);
  }
  return {
    favorite: current?.favorite,
    tags: current?.tags,
    attachments: current?.attachments,
    ...normalizeFormValues(type, values),
    type,
  } as RecordOfType<T>;
}

/** The form's initial values for editing `record`: everything but what forms don't edit. */
export function recordFormDefaults<T extends RecordType>(
  record: RecordOfType<T>,
): Partial<RecordFormValues<T>> {
  const {
    type: _type,
    favorite: _favorite,
    tags: _tags,
    attachments: _attachments,
    ...values
  } = record;
  return values as Partial<RecordFormValues<T>>;
}
