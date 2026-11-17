# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it reaches `1.0.0`. Until then, breaking changes can land in any release.

## [Unreleased]

### Added

### Changed

- Server: `/health` and `/metrics` moved to their own listener on port 3001 (`OPS_PORT`); point the Prometheus
  scrape and the Gatus check at `passmgr-server:3001`.

### Deprecated

### Removed

### Fixed

### Security

- Server: ops routes no longer share the public listener; crash reports label only known client versions
  (`APP_VERSION`, `CLIENT_VERSIONS`); record streams are capped per user and end on logout / session expiry; a user's
  sessions are capped (oldest signed out).
