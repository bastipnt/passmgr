import { PREF_KEYS } from "../preferences/preference-keys";
import { isBoolean, usePreference } from "./use-preference";

export function useWebsiteIconsPreference(): [boolean, (value: boolean) => void] {
  return usePreference(PREF_KEYS.websiteIcons, false, isBoolean);
}
