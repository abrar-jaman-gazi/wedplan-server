
import app from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase,
  closeDatabase,
} from "./config/database.js";

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    const server = app.listen(env.PORT, () => {
      console.log(
        `WedPlan server running at http://localhost:${env.PORT}`
      );
    });

    const shutdown = async (): Promise<void> => {
      console.log("Shutting down WedPlan server");

      server.close(async () => {
        await closeDatabase();
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Unable to start WedPlan server:", error);
    await closeDatabase();
    process.exit(1);
  }
};

void startServer();
