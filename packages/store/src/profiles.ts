import { desc, eq } from "drizzle-orm";
import type { OpenDatabase, SqlDriver } from "./driver";
import { createLocalDb, type LocalDb } from "./local-db";
import { migrate, REGISTRY_MIGRATIONS } from "./migrations";
import type { LocalProfile, ProfileMode } from "./schema/profile-schema";
import { profiles, registryMeta } from "./schema/registry-tables";
import { clearLoginBundle } from "./session-persistence";
import { Vault } from "./vault";

/** A profile on this device, as the registry lists it (ADR 0001 D2). */
export type ProfileEntry = {
  profileId: string;
  mode: ProfileMode;
  /** Linked profiles only, normalized. */
  email: string | null;
  /** Linked profiles only. */
  userId: string | null;
  /** Optional, tells local vaults apart. */
  name: string | null;
  databaseName: string;
  createdAt: string;
  lastUsedAt: string;
  /** The last export from this device; null if never (ADR 0001 D12). */
  lastExportAt: string | null;
};

/** The registry's own database. */
export const REGISTRY_DATABASE = "pass-mgr-profiles";

export function profileDatabaseName(profileId: string): string {
  return `pass-mgr-${profileId}`;
}

/**
 * The database of the app before profiles (ADR 0001 D2, amended 2026-10-07):
 * never opened again, deleted once.
 */
export const LEGACY_DATABASE = "pass-mgr";
const LEGACY_REMOVED = "legacyDatabaseRemoved";

/** `ProfileStore.create` for a profile id the registry already lists. */
export class ProfileExistsError extends Error {
  override message = "A profile with this id already exists on this device";
}

/**
 * The profiles on this device (ADR 0001 D2, amended 2026-10-07): each one is
 * its own SQLite database (a `Vault`: data, keys, outbox, sync state), and a
 * small registry database lists them. Removing a profile deletes its database
 * file. The registry holds no key material.
 *
 * Opened vaults are kept until `close` / `remove`, so a profile is never open
 * twice. Writes span two databases and can't be atomic: a profile's database
 * is written before its registry row and deleted before it, so a crash leaves
 * at worst an unlisted file, never a listed profile without data.
 */
export class ProfileStore {
  private readonly openDatabase: OpenDatabase;
  private readonly registryDriver: SqlDriver;
  private readonly registry: LocalDb;
  private initialized?: Promise<void>;
  private readonly opened = new Map<string, Vault>();

  constructor(
    openDatabase: OpenDatabase,
    {
      registryName = REGISTRY_DATABASE,
      legacyDatabase = LEGACY_DATABASE,
    }: { registryName?: string; legacyDatabase?: string | null } = {},
  ) {
    this.openDatabase = openDatabase;
    this.registryDriver = openDatabase(registryName);
    this.registry = createLocalDb(this.registryDriver);
    this.legacyDatabase = legacyDatabase;
  }

  private readonly legacyDatabase: string | null;

  private ready(): Promise<void> {
    this.initialized ??= (async () => {
      await migrate(this.registryDriver, REGISTRY_MIGRATIONS);
      await this.removeLegacyDatabase();
    })().catch((error: unknown) => {
      this.initialized = undefined;
      throw error;
    });
    return this.initialized;
  }

  /**
   * Delete the pre-profile database once (no users had one worth adopting):
   * it would otherwise keep a vault and an email on the device that no
   * "remove" reaches. A failure is retried on the next launch.
   */
  private async removeLegacyDatabase(): Promise<void> {
    if (this.legacyDatabase === null) return;
    const [done] = await this.registry
      .select()
      .from(registryMeta)
      .where(eq(registryMeta.key, LEGACY_REMOVED));
    if (done) return;
    try {
      await this.openDatabase(this.legacyDatabase).deleteDatabase();
    } catch (e) {
      console.error("Deleting the pre-profile database failed", e);
      return;
    }
    await this.registry
      .insert(registryMeta)
      .values({ key: LEGACY_REMOVED, value: new Date().toISOString() });
  }

  /** Every profile, the most recently used first. */
  async list(): Promise<ProfileEntry[]> {
    await this.ready();
    return await this.registry
      .select()
      .from(profiles)
      .orderBy(desc(profiles.lastUsedAt), desc(profiles.createdAt));
  }

  async get(profileId: string): Promise<ProfileEntry | null> {
    await this.ready();
    const [row] = await this.registry
      .select()
      .from(profiles)
      .where(eq(profiles.profileId, profileId));
    return row ?? null;
  }

  /** The linked profile of this account, if the device has one. */
  async findByUserId(userId: string): Promise<ProfileEntry | null> {
    await this.ready();
    const [row] = await this.registry.select().from(profiles).where(eq(profiles.userId, userId));
    return row ?? null;
  }

  /** The profile's vault, opened once and kept open. Marks the profile as last used. */
  async open(profileId: string): Promise<Vault> {
    const entry = await this.get(profileId);
    if (!entry) throw new Error(`No profile ${profileId} on this device`);
    await this.registry
      .update(profiles)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(profiles.profileId, profileId));
    return this.vaultOf(entry);
  }

  private vaultOf(entry: ProfileEntry): Vault {
    let vault = this.opened.get(entry.profileId);
    if (!vault) {
      vault = new Vault(this.openDatabase(entry.databaseName));
      this.opened.set(entry.profileId, vault);
    }
    return vault;
  }

  /** Close the profile's database, if it's open. Its data stays. */
  async close(profileId: string): Promise<void> {
    const vault = this.opened.get(profileId);
    if (!vault) return;
    this.opened.delete(profileId);
    await vault.destroy();
  }

  /**
   * Add a profile: a new database, filled by `init` (e.g.
   * `Vault.createLocalVault`, `Vault.setAccountKeyMaterial`), then listed.
   * When `init` throws, the database is deleted again and nothing is listed.
   * Resolves the new profile's (open) vault.
   */
  async create(
    profile: LocalProfile,
    init: (vault: Vault) => Promise<void>,
    { name = null }: { name?: string | null } = {},
  ): Promise<{ entry: ProfileEntry; vault: Vault }> {
    if (await this.get(profile.profileId)) throw new ProfileExistsError();

    const now = new Date().toISOString();
    const entry: ProfileEntry = {
      ...profile,
      name: name?.trim() || null,
      databaseName: profileDatabaseName(profile.profileId),
      createdAt: now,
      lastUsedAt: now,
      lastExportAt: null,
    };
    const vault = new Vault(this.openDatabase(entry.databaseName));
    try {
      await init(vault);
      await this.registry.insert(profiles).values(entry);
    } catch (e) {
      await vault.deleteDatabase().catch(() => undefined);
      throw e;
    }
    this.opened.set(entry.profileId, vault);
    return { entry, vault };
  }

  /** Mirror a changed profile row (a linked profile's email, or linking) into the registry. */
  async update(profile: LocalProfile): Promise<void> {
    await this.ready();
    await this.registry
      .update(profiles)
      .set({ mode: profile.mode, email: profile.email, userId: profile.userId })
      .where(eq(profiles.profileId, profile.profileId));
  }

  async rename(profileId: string, name: string | null): Promise<void> {
    await this.ready();
    await this.registry
      .update(profiles)
      .set({ name: name?.trim() || null })
      .where(eq(profiles.profileId, profileId));
  }

  /** Record an export of the profile's data (resets the backup reminder, ADR 0001 D12). */
  async markExported(profileId: string, at = new Date()): Promise<void> {
    await this.ready();
    await this.registry
      .update(profiles)
      .set({ lastExportAt: at.toISOString() })
      .where(eq(profiles.profileId, profileId));
  }

  /**
   * Run `fn` against the profile's vault: the open one, or one opened just for
   * this and closed afterwards. For profiles that aren't the active one (e.g.
   * counting what removing them would lose).
   */
  async withVault<T>(profileId: string, fn: (vault: Vault) => Promise<T>): Promise<T> {
    const entry = await this.get(profileId);
    if (!entry) throw new Error(`No profile ${profileId} on this device`);
    const open = this.opened.get(profileId);
    if (open) return await fn(open);

    const vault = new Vault(this.openDatabase(entry.databaseName));
    try {
      return await fn(vault);
    } finally {
      await vault.destroy();
    }
  }

  /**
   * Remove a profile from this device: its database file, its persisted login
   * (mobile) and its registry row. For a `local` profile that is the only copy
   * of its data: the caller confirms first.
   */
  async remove(profileId: string): Promise<void> {
    const entry = await this.get(profileId);
    if (!entry) return;

    const open = this.opened.get(profileId);
    this.opened.delete(profileId);
    // Delete through the open connection, if any: a second one could keep the file.
    await (open ? open.deleteDatabase() : this.openDatabase(entry.databaseName).deleteDatabase());
    await clearLoginBundle(profileId);
    await this.registry.delete(profiles).where(eq(profiles.profileId, profileId));
  }

  /** Remove every profile (see `remove`). Resolves the removed ones. */
  async removeAll(): Promise<ProfileEntry[]> {
    const removed = await this.list();
    for (const { profileId } of removed) await this.remove(profileId);
    return removed;
  }
}
