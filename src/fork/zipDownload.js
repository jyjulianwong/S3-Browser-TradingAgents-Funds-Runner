// FORK: custom code, not part of the upstream s3-browser repo.
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Zip, ZipDeflate } from "fflate";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const excludeRegex = new RegExp(process.env.EXCLUDE_PATTERN || /(?!)/);

// Recursively list every object under `prefix` (no delimiter), following
// pagination. Folder placeholder keys (ending in "/") and excluded keys are
// skipped.
export const listAllObjects = async (prefix) => {
  const objects = [];
  let continuationToken;
  do {
    const data = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: process.env.BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const { Key, Size } of data.Contents || []) {
      if (Key.endsWith("/") || excludeRegex.test(Key)) continue;
      objects.push({ key: Key, size: Size });
    }
    continuationToken = data.IsTruncated
      ? data.NextContinuationToken
      : undefined;
  } while (continuationToken);
  return objects;
};

export const objectUrl = (key) =>
  `https://${process.env.BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURI(key)}`;

export const zipFileName = (prefix) => {
  const name = prefix.replace(/\/$/, "").split("/").pop();
  return `${name || process.env.BUCKET_NAME || "bucket"}.zip`;
};

// Build a ZIP of everything under `prefix` and return it as a Blob. Entries
// are paths relative to `prefix`. `onProgress(done, total)` is called after
// each object has been added.
export const buildZip = async (prefix, { onProgress, fetchFn } = {}) => {
  const doFetch = fetchFn || ((...args) => fetch(...args));
  const objects = await listAllObjects(prefix);
  if (objects.length === 0) throw new Error("This folder has no files.");

  const chunks = [];
  let zipError;
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err;
    else chunks.push(chunk);
  });

  onProgress?.(0, objects.length);
  for (let i = 0; i < objects.length; i++) {
    const { key } = objects[i];
    const response = await doFetch(objectUrl(key));
    if (!response.ok) {
      zip.terminate();
      throw new Error(`Failed to download ${key} (HTTP ${response.status}).`);
    }
    const data = new Uint8Array(await response.arrayBuffer());
    const file = new ZipDeflate(key.slice(prefix.length), { level: 6 });
    zip.add(file);
    file.push(data, true);
    if (zipError) throw zipError;
    onProgress?.(i + 1, objects.length);
  }
  zip.end();
  if (zipError) throw zipError;
  return new Blob(chunks, { type: "application/zip" });
};

export const downloadZip = async (prefix, options) => {
  const blob = await buildZip(prefix, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFileName(prefix);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
