import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv"
dotenv.config()

const s3 = new S3Client({
	region: 'ap-south-1',
	credentials:{
		accessKeyId:process.env.aws_access_key_id,
		secretAccessKey: process.env.aws_secret_access_key,
	},
});
console.log(process.env.s3_bucket_name);
export const generateSignedPutUrl = async({ fileName, fileType }) => {
  try {
    const command = new PutObjectCommand({
      Bucket: process.env.s3_bucket_name,
      Key: `uploads/${fileName}`,
      ContentType: fileType,
    });

    const url = await getSignedUrl(s3, command, {
      expiresIn: 3600, // URL valid for 60 seconds
    });

    return url;
  } catch (err) {
    console.error(err);
    throw new Error("Error generating URL");
  }
}

export const generateSignedGetUrl = async({fileId,download = false,filename}) => {
  try {
    console.log(filename);
    const command = new GetObjectCommand({
      Bucket: process.env.s3_bucket_name,
      Key: `uploads/${fileId}`,
      ResponseContentDisposition : `${download == true ? 'attachment' : 'inline'}; filename=${filename}`
    });

    const url = await getSignedUrl(s3, command, {
      expiresIn: 3600,
    });
    return url;
  } catch (error) {
    console.error(error);
    throw new Error("Error generating URL");
  }
}

export const getS3FileMetaData = async(key) => {
  try {
    
    const command = new HeadObjectCommand({
      Bucket: process.env.s3_bucket_name,
      Key: `uploads/${key}`,
    });

    const response = await s3.send(command)
    return response;
  } catch (error) {
    console.error(error);
    throw new Error("Error generating URL");
  }
}

export const deleteS3File = async(key) => {
  try {
    
    const command = new DeleteObjectCommand({
      Bucket: process.env.s3_bucket_name,
      Key: `uploads/${key}`,
    });

    const response = await s3.send(command)
    return response;
  } catch (error) {
    console.error(error);
    throw new Error("Cannot delete your file from cloud");
  }
}
export const deleteS3MultipleFile = async(keys) => {
  try {
    
    const command = new DeleteObjectsCommand({
      Bucket: process.env.s3_bucket_name,
      Delete: {
        Objects: keys,  
      },
    });

    const response = await s3.send(command)
    return response;
  } catch (error) {
    console.error(error);
    throw new Error("Cannot delete your files from cloud");
  }
}

