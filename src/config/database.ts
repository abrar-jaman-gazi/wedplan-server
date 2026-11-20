
import { MongoClient, Db } from "mongodb";
import { env } from "./env.js";

let client: MongoClient | null = null;
let database: Db | null = null;

export const connectDatabase = async (): Promise<Db> => {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from the backend environment");
  }

  try {
    client = new MongoClient(env.MONGODB_URI);

    await client.connect();

    database = client.db(env.MONGODB_DATABASE);

    await database.command({ ping: 1 });

    console.log(`MongoDB connected successfully: ${env.MONGODB_DATABASE}`);

    return database;
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    throw error;
  }
};

export const getDatabase = (): Db => {
  if (!database) {
    throw new Error("Database has not been initialized");
  }

  return database;
};

export const closeDatabase = async (): Promise<void> => {
  if (client) {
    await client.close();
    client = null;
    database = null;
    console.log("MongoDB connection closed");
  }
};
