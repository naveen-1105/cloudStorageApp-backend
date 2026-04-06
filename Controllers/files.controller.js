import { createWriteStream } from "fs";
import { rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { ObjectId } from "mongodb";
import File from "../Models/file.model.js";
import Directory from "../Models/directory.model.js";
import { fileName } from "../validators/nameValidator.js";
import {deleteS3File, generateSignedGetUrl, generateSignedPutUrl, getS3FileMetaData } from "../services/generateS3Url.js";
import { createCloudFrontGetSignedurl } from "../services/cloudfront.js";


export const addFile = async (req, res, next) => {
  const parentDirId = req.params.parentDirId || req.user.rootDirId;
  const parentDir = await Directory.findOne({_id: parentDirId})
  const filename = req.headers.filename || "untitled";
  const filesize = req.headers.filesize;
  if(filesize > 300 * 1024 * 1024){
    return res.status(413).json({message: "File size is too big"})
  }

  const rootDir = await Directory.findOne({_id: req.user.rootDirId})

  if(req.user.maxSizeAllocated - rootDir.size < filesize){
    return res.destroy()
  }

  const extension = path.extname(filename);
  console.log(filename);

  try {
    // Insert file metadata first
    const fileData = await File.insertOne({
      extension,
      name: filename,
      size: filesize,
      parentDirId,
      userId: String(req.user._id),
    });
    const id = fileData._id;
    const fullFileName = `${id}${extension}`;
    const filePath = `${import.meta.dirname}/../storage/${fullFileName}`
    const writeStream = createWriteStream(filePath);

    let totalFileLength = 0;
    let abort = false;
    let  isFileUploadCompleted = false
    req.on("data",async(chunk) => {
      if(abort == true) return;
        totalFileLength += chunk.length
        if(totalFileLength > filesize){
          abort = true;
          writeStream.close()
          await rm(filePath)
          fileData.deleteOne()
          return req.destroy()
        }
        writeStream.write(chunk)
    })

    req.on("end", async () => {
      isFileUploadCompleted = true
      parentDir.size += totalFileLength;
      await parentDir.save();
      let newParentDirId = parentDir.parentDirId
      while(newParentDirId){
        const newParentDir = await Directory.findOne({_id: newParentDirId})
        console.log(newParentDir);
        newParentDir.size += totalFileLength;
        await newParentDir.save()
        newParentDirId = newParentDir.parentDirId
      }
      return res.status(201).json({ message: "File Uploaded" });
    });


    req.on("close",async () => {
      if(!isFileUploadCompleted){
        await File.deleteOne({ _id: id });
        await rm(filePath)
        console.log("yhi se ho rha");
        return res.status(201).json({ message: "File Upload cancelled" });
      }
    })
    req.on("error", async () => {
      await File.deleteOne({ _id: id });
      await rm(filePath)
    });

    writeStream.on("error", (err) => {
      console.log(err);
      next(err);
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
};

export const s3UploadInitiate = async (req,res,next) => {
  const {size} = req.body;

  const rootDir = await Directory.findOne({ _id: req.user.rootDirId });
  if (!rootDir) {
    return res.status(404).json({ message: "Root directory not found" });
  }

  const rootDirId = req.user.rootDirId
  const parentDirId = req.params.parentDirId == undefined ? rootDirId : req.params.parentDirId;
  if (!parentDirId) {
    return res.status(400).json({ message: "parentDirId is required" });
  }
  const filename = req.headers.filename || "untitled";
  const extension = path.extname(filename);

  

  if(filename == null || extension == null){
    return res.status(400).json({message : "Please enter a valid name or contentType"})
  }
  if(size < 0){
    return res.status(400).json({message: "the size of file is too small"})
  }
  if(req.user.maxSizeAllocated - rootDir.size < size){
    return res.destroy()
  }

    try {
      const parentDir = await Directory.findOne({ _id: parentDirId });
      if (!parentDir) {
        return res.status(404).json({ message: "Parent directory not found" });
      }
      if (parentDir.userId !== String(req.user._id)) {
        return res
          .status(401)
          .json({ message: "File cannot be seen because you are not the owner" });
      }
  
    const fileData = await File.insertOne({
        extension: extension,
        name: filename,
        size: size,
        parentDirId,
        userId: String(req.user._id),
        isUploading: true,
      });
      const url = await generateSignedPutUrl({ fileName: `${fileData._id}${extension}`, extension });
  
      res.status(201).json({fileId: fileData._id,url: url});
    } catch (error) {
      console.log(error);
      next();
    }
}

export const s3UploadComplete = async (req, res,next) => {
  const {fileId} = req.body;
  console.log("fileId: ", fileId);
  const userId = req.user._id;


  try {
    const fileData = await File.findOne({_id : fileId,userId : userId})
  
    const parentDir = await Directory.findOne({_id: fileData.parentDirId})
  
    const data = await getS3FileMetaData(`${fileData._id}${fileData.extension}`)
    if(data.ContentLength !== fileData.size){
      await File.deleteOne({_id : fileId})
      return res.status(507).json({messahe : "The actual file size doesnot match with specified file size"})
    }
    const totalFileLength = fileData.size
    parentDir.size += totalFileLength;
    await parentDir.save();
        let newParentDirId = parentDir.parentDirId
        while(newParentDirId){
          const newParentDir = await Directory.findOne({_id: newParentDirId})
          newParentDir.size += totalFileLength;
          await newParentDir.save()
          newParentDirId = newParentDir.parentDirId
        }
    fileData.isUploading = false;
    await fileData.save()
    
    return res.status(200).json({message: "File upload successfull"})
  } catch (error) {
    await File.deleteOne({_id : fileId})
    console.log(error);
  }
}

// export const s3GetFileUrl = async (req, res,next) => {
//   const {fileId} = req.body;
//   const userId = req.user._id;
  
//   const file = await File.findOne({_id : fileId, userId : userId});
//   if(!file){
//     return res.status(404).json({message: "file not found on our records"})
//   }
//   const url = await generateSignedGetUrl(fileId);
//   return res.status(200).json({url: url})
// }
export const getFileById = async (req, res) => {
  const { id } = req.params;
  try {
    const fileData = await File.findOne({ _id: id });
    if (!fileData) {
      return res.status(404).json({ message: "File Not Found!" });
    }

    const parentDirId = fileData.parentDirId;

    const parentDir = await Directory.findOne({ _id: parentDirId });

    if (parentDir.userId !== String(req.user._id)) {
      return res
        .status(401)
        .json({ message: "File cannot be seen because you are not the owner" });
    }
    console.log("download tk to nhi aa rha h");
    if (req.query.action === "download") {
      console.log("download tk to aa rha h");
      const url = await generateSignedGetUrl({fileId:`${id}${fileData.extension}`,download: true, filename : fileData.name})

      return res.redirect(url)
    }
        console.log("download tk to nhi 2 aa rha h");
    const url = createCloudFrontGetSignedurl({key:`${id}${fileData.extension}`})

    return res.redirect(url)
  } catch (error) {
    console.log(error);
  }
};

export const renameFile = async (req, res, next) => {
  const { id } = req.params;


  try {
    const fileData = await File.findOne({ _id: id, userId: req.user._id });
    const parentDirId = fileData.parentDirId;
    const parentDir = await Directory.find({ _id: parentDirId });
    if (parentDir.userId !== req.user.id) {
      return res.status(401).json({
        message: "File cannot be renamed because you are not the owner",
      });
    }
    const {success, data, error} = fileName.safeParse(req.body);
        
        if(!success){
          return res.status(400).json(error.issues[0].message)
        }
      const { newFilename } = data;
    fileData.name = newFilename
    await fileData.save();
    return res.status(200).json({ message: "Renamed" });
  } catch (err) {
    err.status = 500;
    next(err);
  }
};

export const deleteFile = async (req, res, next) => {
  const { id } = req.params;
  try {
    const fileData = await File.findOne({
      _id: new ObjectId(id),
      userId: req.user._id,
    });
    if (!fileData) {
      return res.status(404).json({ message: "File Not Found!" });
    }
    const parentDirId = fileData.parentDirId;
    const parentDir = await Directory.findOne({
      _id: new ObjectId(parentDirId),
    });
    if (parentDir.userId !== String(req.user._id)) {
      return res
        .status(401)
        .json({ message: "File cannot be deleted because you are not the owner" });
    }
    parentDir.size -= fileData.size;
    await parentDir.save();
    let newParentDirId = parentDir.parentDirId
    console.log("newParentDirId: ",parentDirId);
    while(newParentDirId){
      const newParentDir = await Directory.findOne({_id: newParentDirId})
      console.log(newParentDir);
      newParentDir.size -= fileData.size;
      await newParentDir.save()
      newParentDirId = newParentDir.parentDirId
    }
    await File.deleteOne({ _id: new ObjectId(id) });
    const response = await deleteS3File(`${fileData._id}${fileData.extension}`)
    
    return res.status(200).json({ message: "File Deleted Successfully" });
  } catch (err) {
    console.log("error:", err);
    next(err);
  }
};
