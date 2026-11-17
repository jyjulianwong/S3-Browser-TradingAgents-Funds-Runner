import { useQuery } from "@tanstack/react-query";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  // Anonymous (unsigned) requests: the bucket is public, so no credentials
  // are needed and none must ever be embedded in the client bundle.
  signer: { sign: async (request) => request },
  credentials: async () => ({ accessKeyId: "", secretAccessKey: "" }),
});

const excludeRegex = new RegExp(process.env.EXCLUDE_PATTERN || /(?!)/);

const listContents = async (prefix) => {
  console.debug("Retrieving data from AWS SDK");
  const data = await s3Client.send(
    new ListObjectsV2Command({
      Bucket: process.env.BUCKET_NAME,
      Prefix: prefix,
      Delimiter: "/",
    })
  );
  console.debug(`Received data: ${JSON.stringify(data, null, 2)}`);
  return {
    folders:
      data.CommonPrefixes?.filter(
        ({ Prefix }) => !excludeRegex.test(Prefix)
      ).map(({ Prefix }) => ({
        name: Prefix.slice(prefix.length),
        path: Prefix,
        url: `/?prefix=${Prefix}`,
      })) || [],
    objects:
      data.Contents?.filter(({ Key }) => !excludeRegex.test(Key)).map(
        ({ Key, LastModified, Size }) => ({
          name: Key.slice(prefix.length),
          lastModified: LastModified,
          size: Size,
          path: Key,
          url: `https://${process.env.BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${Key}`,
        })
      ) || [],
  };
};

export const useContents = (prefix) => {
  return useQuery(["contents", prefix], () => listContents(prefix));
};
