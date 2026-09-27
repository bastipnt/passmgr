interface ImportMetaEnv {
  readonly VITE_SERVER_URL: string;
  /** Public origin, e.g. https://vault.example.com — enables canonical/OG URLs */
  readonly VITE_SITE_URL?: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
