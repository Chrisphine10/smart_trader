import { migrate, seedAdmin } from "../lib/db";

migrate();
seedAdmin();
console.log("Database is ready.");
