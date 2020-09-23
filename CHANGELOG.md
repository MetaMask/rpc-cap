# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For changes prior to `3.0.0`, please see the package's [GitHub Releases](https://github.com/MetaMask/rpc-cap/releases).

## [Unreleased]

## [3.2.0] - 2020-09-23

### Changed

- Update various dependencies
  - eth-rpc-errors@3.0.0 ([#116](https://github.com/MetaMask/rpc-cap/pull/116))
  - json-rpc-engine@5.3.0 ([#115](https://github.com/MetaMask/rpc-cap/pull/115))
  - @metamask/controllers@3.1.0 ([#114](https://github.com/MetaMask/rpc-cap/pull/114))

## [3.1.0] - 2020-07-29

### Changed

- Update/remove various dependencies, resulting in a smaller bundle and better performance

## [3.0.1] - 2020-07-06

### Changed

- `requestPermissionsMiddleware`: Stringify `req.id` when defaulting to it as the permissions request ID
  - Allowing numerical IDs was a mistake
- `IPermissionsRequest`
  - Update type of `metadata.id` from `string | number` to `string`

## [3.0.0] - 2020-07-05

### Changed

- **BREAKING:** `requestPermissionsMiddleware`: Stop using or setting the `id` property from the `IOriginMetadata` parameter
- **BREAKING:** `requestPermissionsMiddleware`: Default to `req.id` value as the pending permissions request object `id`, with `uuid()` as a fallback
- `requestPermissionsMiddleware`: Rename `IOriginMetadata` parameter from `metadata` to `domain`, in line with other middleware functions
  - Its former name led to confused usage by this package and its consumers
- Types
  - `IPermissionsRequest`
    - Remove top-level `origin` property, since there's already a `metadata.origin` property
    - Update type of `metadata.id` from `string` to `string | number`
  - `IOriginMetadata`
    - Remove `id` property, which is now never used in practice

[Unreleased]:https://github.com/MetaMask/rpc-cap/compare/v3.0.1...HEAD
[3.1.0]:https://github.com/MetaMask/rpc-cap/compare/v3.0.1...v3.1.0
[3.0.1]:https://github.com/MetaMask/rpc-cap/compare/v3.0.0...v3.0.1
