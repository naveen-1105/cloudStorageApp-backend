import express from "express";
import cors from "cors";
import directoryRoutes from "./routes/directoryRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js"
import cookieParser from "cookie-parser"
import CheckAuth from "./Middleware/auth.js";
import { connectDB } from "./Middleware/db.js";
import redisClient from "./util/redis.js";
import dotenv from "dotenv"
dotenv.config()
import helmet from "helmet";
import {spawn} from "child_process"
import crypto from "crypto"

try {
  connectDB();

  const app = express();
  await redisClient.connect()

app.use(helmet())
app.use(express.json());
app.use(cookieParser(process.env.secretkey_cookieParser))

const allowedOrigins = process.env.client_url
  .split(',')
  .map(origin => origin.trim());

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (Postman, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.post("/github-webhooks",(req,res) => {
  
  const givenSignature = req.headers["x-hub-signature-256"];
  if(!givenSignature){
    return res.status(401).json({message: "you are not allowed to visit this endpoint"})
  }
  
  try {
  const calculatedSignature = "sha256=" + crypto.createHmac("sha256",process.env.github_webhook_secretKey).update(JSON.stringify(req.body)).digest("hex")

  if(givenSignature !== calculatedSignature){
    return res.status(401).json({message: "you are not allowed to visit this endpoint"})
  }
    const bashChildProcess = spawn("bash",["/home/ubuntu/cloudStorageApp-frontend/deploy.sh"])
    bashChildProcess.stdout.on("data", (data) => {
      process.stdout.write(data);
    })
  
    bashChildProcess.on("close",(code) => {
      if(code === 0){
        console.log("Script executed sucessfully!");
      }else{
        console.log("script failed");
      }
    })
  
    bashChildProcess.on('error',(err) => {
      console.log(err);
    })
  } catch (error) {
    console.log(error);
  }
  res.json({message: "OK"})
})

app.get("/",(req,res) => {
  res.json({message: "hello now u r at storageApp"})
})
app.use("/directory",CheckAuth, directoryRoutes);
app.use("/file",CheckAuth, fileRoutes);
app.use("/auth", authRoutes);
app.use("/user",CheckAuth, userRoutes);
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ message: "Something went wrong!" });
});


app.listen(4000, () => {
  console.log(`Server Started`);
});

} catch (error) {
  console.log(error);
}




