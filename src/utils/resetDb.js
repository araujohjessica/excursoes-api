import fs from "fs";
import dotenv from "dotenv";

dotenv.config();
const { databaseFile, initializeDatabase } = await import("../db.js");

for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(databaseFile + suffix, { force: true });
initializeDatabase();
console.log("Banco zerado e recriado.");
