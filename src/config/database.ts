
import { MongoClient, Db } from "mongodb";
import { env } from "./env.js";

let client: MongoClient | null = null;
let database: Db | null = null;
let connectionPromise: Promise<Db> | null = null;

export const getMongoClient = (): MongoClient => {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing");
  }

  if (!client) {
    client = new MongoClient(env.MONGODB_URI);
  }

  return client;
};

export const connectDatabase = async (): Promise<Db> => {
  if (database) {
    return database;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const mongoClient = getMongoClient();

    await mongoClient.connect();

    const connectedDatabase = mongoClient.db(env.MONGODB_DATABASE);

    await connectedDatabase.command({ ping: 1 });

    database = connectedDatabase;

    console.log(
      `MongoDB connected successfully: ${env.MONGODB_DATABASE}`
    );

    return connectedDatabase;
  })();

  try {
    return await connectionPromise;
  } catch (error) {
    connectionPromise = null;
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
    connectionPromise = null;
    console.log("MongoDB connection closed");
  }
};
