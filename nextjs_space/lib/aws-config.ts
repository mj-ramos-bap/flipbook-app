import { S3Client } from "@aws-sdk/client-s3";

export function getBucketConfig() {
  return {
    bucketName: process.env.GCS_BUCKET_NAME ?? process.env.AWS_BUCKET_NAME ?? "",
    folderPrefix: process.env.AWS_FOLDER_PREFIX ?? ""
  };
}

export function createS3Client() {
  const accessKeyId = process.env.GCS_HMAC_ACCESS_ID;
  const secretAccessKey = process.env.GCS_HMAC_SECRET;
  if (accessKeyId && secretAccessKey) {
    return new S3Client({
      endpoint: "https://storage.googleapis.com",
      region: "auto",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }
  return new S3Client({});
}
