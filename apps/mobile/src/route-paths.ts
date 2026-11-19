import type { Href } from "expo-router";

/**
 * At `src/`, not `src/app/`: expo-router turns every file under `src/app/` into a route. The URLs are
 * expo-router's file-based routes, so they differ from web's; typed routes make the builders cast to `Href`.
 */
export const recordPaths = {
  index: "/" as Href,
  search: "/search" as Href,

  create: "/new" as Href,
  createGeneratePassword: "/generate-password" as Href,

  createLogin: (website?: string) =>
    (website
      ? `/new?type=login&website=${encodeURIComponent(website)}`
      : "/new?type=login") as Href,
  duplicate: (recordId: string) => `/new?duplicate=${recordId}` as Href,
  record: (recordId: string) => `/${recordId}` as Href,
  editRecord: (recordId: string) => `/${recordId}/edit` as Href,
  generatePassword: (recordId: string) => `/${recordId}/generate-password` as Href,
  recordVersions: (recordId: string) => `/${recordId}/versions` as Href,
  version: (recordId: string, version: number) => `/${recordId}/versions/${version}` as Href,
} as const;

export const settingsPaths = {
  index: "/settings" as Href,
  general: "/settings/general" as Href,
  generator: "/settings/generator" as Href,
  security: "/settings/security" as Href,
  vaults: "/settings/vaults" as Href,
  trash: "/settings/trash" as Href,
  tags: "/settings/tags" as Href,
  tag: (tag: string) => `/settings/tag?tag=${encodeURIComponent(tag)}` as Href,
  vault: (vaultId?: string) =>
    (vaultId ? `/settings/vault?vaultId=${vaultId}` : "/settings/vault") as Href,
  vaultMembers: (vaultId: string) => `/settings/members?vaultId=${vaultId}` as Href,
  vaultMember: (vaultId: string, userId: string) =>
    `/settings/member?vaultId=${vaultId}&userId=${userId}` as Href,
  inviteMember: (vaultId: string) => `/settings/invite?vaultId=${vaultId}` as Href,
} as const;
