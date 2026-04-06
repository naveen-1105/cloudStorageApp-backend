import { createClient } from "redis";
import dotenv from "dotenv"
dotenv.config()

const redisClient = createClient({
  url: process.env.redis_url
  
});

redisClient.on("connect", () => {
  console.log("✅ Redis connected");
});

redisClient.on("error", (err) => {
  console.error("❌ Redis error:", err);
});


export default redisClient;