import { reset } from "drizzle-seed";
import { db, schema } from ".";

const resetDevDB = async () => {
  console.log("Resetting dev DB...");
  await reset(db, schema);
  process.exit();
};

await resetDevDB();
