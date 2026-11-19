// Backs up the profile databases, never the SecureStore values: see docs/security/threat-model-inputs.md.
// Written at prebuild: an existing `android/` needs `expo prebuild --clean`. Auto Backup skips apps above 25 MB.
const fs = require("node:fs");
const path = require("node:path");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const BACKUP_RULES = "backup_rules";
const EXTRACTION_RULES = "data_extraction_rules";

const RULES = `    <include domain="file" path="SQLite/"/>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>`;

// Android 11 and lower.
const backupRules = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${RULES}
</full-backup-content>
`;

// Android 12 and higher.
const extractionRules = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${RULES}
  </cloud-backup>
  <device-transfer>
${RULES}
  </device-transfer>
</data-extraction-rules>
`;

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withAndroidBackup = (config) => {
  config = withDangerousMod(config, [
    "android",
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${BACKUP_RULES}.xml`), backupRules);
      fs.writeFileSync(path.join(dir, `${EXTRACTION_RULES}.xml`), extractionRules);
      return config;
    },
  ]);

  return withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app.$["android:allowBackup"] = "true";
    app.$["android:fullBackupContent"] = `@xml/${BACKUP_RULES}`;
    app.$["android:dataExtractionRules"] = `@xml/${EXTRACTION_RULES}`;
    return config;
  });
};

module.exports = withAndroidBackup;
