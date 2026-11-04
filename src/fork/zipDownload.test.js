// FORK: custom code, not part of the upstream s3-browser repo.
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { unzipSync, strFromU8, strToU8 } from "fflate";
import { buildZip, zipFileName } from "./zipDownload";

const s3Mock = mockClient(S3Client);

const readBlob = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });

const okResponse = (text) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => strToU8(text).buffer,
});

beforeEach(() => s3Mock.reset());

test("zips nested objects relative to the prefix, following pagination", async () => {
  s3Mock
    .on(ListObjectsV2Command)
    .resolvesOnce({
      Contents: [
        { Key: "a/", Size: 0 },
        { Key: "a/one.txt", Size: 3 },
      ],
      IsTruncated: true,
      NextContinuationToken: "t",
    })
    .resolvesOnce({
      Contents: [
        { Key: "a/sub/two.txt", Size: 3 },
        { Key: "a/index.html", Size: 1 }, // matches EXCLUDE_PATTERN? no: ^index only
      ],
    });
  const fetchFn = jest.fn(async (url) =>
    okResponse(
      url.endsWith("one.txt") ? "one" : url.endsWith("two.txt") ? "two" : "idx"
    )
  );
  const progress = jest.fn();

  const blob = await buildZip("a/", { fetchFn, onProgress: progress });
  const files = unzipSync(await readBlob(blob));

  expect(Object.keys(files).sort()).toEqual([
    "index.html",
    "one.txt",
    "sub/two.txt",
  ]);
  expect(strFromU8(files["sub/two.txt"])).toBe("two");
  expect(progress).toHaveBeenLastCalledWith(3, 3);
});

test("skips excluded keys", async () => {
  s3Mock.on(ListObjectsV2Command).resolves({
    Contents: [
      { Key: "index.html", Size: 1 },
      { Key: "x.txt", Size: 1 },
    ],
  });
  const files = unzipSync(
    await readBlob(await buildZip("", { fetchFn: async () => okResponse("x") }))
  );
  expect(Object.keys(files)).toEqual(["x.txt"]);
});

test("rejects on empty folder and failed fetch", async () => {
  s3Mock.on(ListObjectsV2Command).resolves({});
  await expect(buildZip("e/")).rejects.toThrow("no files");

  s3Mock.reset();
  s3Mock
    .on(ListObjectsV2Command)
    .resolves({ Contents: [{ Key: "e/f", Size: 1 }] });
  await expect(
    buildZip("e/", { fetchFn: async () => ({ ok: false, status: 403 }) })
  ).rejects.toThrow("HTTP 403");
});

test("zipFileName", () => {
  expect(zipFileName("a/b/")).toBe("b.zip");
  expect(zipFileName("")).toBe("www.example.com.zip");
});
