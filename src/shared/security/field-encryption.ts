import crypto from "node:crypto";
import { getServerEnv } from "@/config/env";

const algorithm = "aes-256-gcm";

function key() {
  const raw = getServerEnv().FIELD_ENCRYPTION_KEY;
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) {
    return decoded;
  }

  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === 32) {
    return utf8;
  }

  throw new Error("FIELD_ENCRYPTION_KEY must be a 32-byte UTF-8 value or base64-encoded 32-byte value");
}

export function encryptField(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptField(payload: string) {
  const [ivPart, tagPart, cipherPart] = payload.split(".");
  if (!ivPart || !tagPart || !cipherPart) {
    throw new Error("Invalid encrypted field payload");
  }

  const decipher = crypto.createDecipheriv(algorithm, key(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
