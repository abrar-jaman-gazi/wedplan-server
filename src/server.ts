
import app from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase,
  closeDatabase,
  getDatabase,
} from "./config/database.js";
import { ensureTransactionIndexes } from "./models/transaction.model.js";

const initializeIndexes = async (): Promise<void> => {
  const database = getDatabase();

  await ensureTransactionIndexes();

  await database.collection("processed_stripe_events").createIndex(
    { eventId: 1 },
    {
      unique: true,
      name: "unique_stripe_event_id",
    }
  );

  console.log("WedPlan database indexes initialized successfully");
};

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    await initializeIndexes();

    const server = app.listen(env.PORT, () => {
      console.log(
        `WedPlan server running at http://localhost:${env.PORT}`
      );
    });

    let isShuttingDown = false;

    const shutdown = async (): Promise<void> => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;

      console.log("Shutting down WedPlan server");

      server.close(async (error) => {
        if (error) {
          console.error("Error closing HTTP server:", error);
          process.exitCode = 1;
        }

        try {
          await closeDatabase();
        } catch (databaseError) {
          console.error("Error closing MongoDB connection:", databaseError);
          process.exitCode = 1;
        }

        process.exit();
      });
    };

    process.on("SIGINT", () => {
      void shutdown();
    });

    process.on("SIGTERM", () => {
      void shutdown();
    });
  } catch (error) {
    console.error("Unable to start WedPlan server:", error);

    await closeDatabase();

    process.exit(1);
  }
};

void startServer();
