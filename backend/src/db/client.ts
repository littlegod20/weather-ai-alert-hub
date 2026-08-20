import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { getEnv } from "../config/env";

const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
