interface ImportMetaEnv {
  readonly VITE_SERVER_URL: string;
  /** Public origin, e.g. https://vault.example.com — enables canonical/OG URLs */
  readonly VITE_SITE_URL?: string;
  /** Release tag (e.g. v0.0.27), set by the release build */
  readonly VITE_APP_VERSION?: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
