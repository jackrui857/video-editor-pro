import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, InsertVideoProject, projectAssets, users, videoProjects } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listVideoProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(videoProjects).where(eq(videoProjects.userId, userId)).orderBy(desc(videoProjects.updatedAt));
}

export async function getVideoProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const records = await db.select().from(videoProjects).where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId))).limit(1);
  return records[0];
}

export async function createVideoProject(project: InsertVideoProject) {
  const db = await getDb();
  if (!db) throw new Error("資料庫目前無法使用，無法建立影片專案。");
  const result = await db.insert(videoProjects).values(project);
  return Number(result[0].insertId);
}

export async function updateVideoProject(userId: number, projectId: number, payload: Pick<InsertVideoProject, "name" | "aspectRatio" | "outputQuality" | "durationMs" | "editorState">) {
  const db = await getDb();
  if (!db) throw new Error("資料庫目前無法使用，無法儲存影片專案。");
  await db.update(videoProjects).set(payload).where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)));
  return getVideoProject(userId, projectId);
}

export async function addProjectAsset(asset: typeof projectAssets.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("資料庫目前無法使用，無法記錄媒體檔案。");
  const result = await db.insert(projectAssets).values(asset);
  return Number(result[0].insertId);
}

export async function getProjectAsset(userId: number, assetId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const records = await db.select().from(projectAssets).where(and(eq(projectAssets.id, assetId), eq(projectAssets.userId, userId))).limit(1);
  return records[0];
}
