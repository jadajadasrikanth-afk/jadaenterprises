import { supabase } from "./supabaseClient";

const BUCKET = "user-documents";
type FileType = "id_proof" | "shop_photo";

function pathFor(userId: string, fileType: FileType, ext: string) {
  return `${userId}/${fileType}.${ext}`;
}

// Uploads directly to the user's own folder. Storage RLS (see schema.sql)
// only allows a user to write under their own user id — enforced by the
// database itself, not by this code, so this is safe even though it runs
// entirely in the browser.
export async function uploadDocument(userId: string, fileType: FileType, file: File) {
  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = pathFor(userId, fileType, ext);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw error;
  return path;
}

// Short-lived signed URL for viewing a file. Storage RLS still applies:
// a non-admin calling this for someone else's path gets an error, not a URL.
export async function getDocumentUrl(path: string, expiresInSeconds = 120) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
