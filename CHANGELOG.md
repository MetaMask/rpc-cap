# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For changes prior to `3.0.0`, please see the package's [GitHub Releases](https://github.com/MetaMask/rpc-cap/releases).

## [Unreleased]

## [4.0.0] - 2020-12-22

### Changed

- **(SEMVER-MAJOR)** `filterResponse` caveat now performs a deep equality check ([#127](https://github.com/MetaMask/rpc-cap/pull/127))
  - The filter was previously just a strict equality check per array item.
  Anything that can be compared by [`fast-deep-equal@^2.0.1`](https://npmjs.com/package/fast-deep-equal) can now be added to the caveat value.
  Whether something _should_ be added we leave to the consumer.
  - Since consumers may have relied on the previous behavior for object and/or array values, this change justifies a major version bump.

## [3.2.1] - 2020-11-19

### Changed

- @metamask/controllers@5.0.0 ([#121](https://github.com/MetaMask/rpc-cap/pull/121))

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

- **(SEMVER-MAJOR)** `requestPermissionsMiddleware`: Stop using or setting the `id` property from the `IOriginMetadata` parameter
- **(SEMVER-MAJOR)** `requestPermissionsMiddleware`: Default to `req.id` value as the pending permissions request object `id`, with `uuid()` as a fallback
- `requestPermissionsMiddleware`: Rename `IOriginMetadata` parameter from `metadata` to `domain`, in line with other middleware functions
  - Its former name led to confused usage by this package and its consumers
- Types
  - `IPermissionsRequest`
    - Remove top-level `origin` property, since there's already a `metadata.origin` property
    - Update type of `metadata.id` from `string` to `string | number`
  - `IOriginMetadata`
    - Remove `id` property, which is now never used in practice

[Unreleased]:https://github.com/MetaMask/rpc-cap/compare/v3.2.1...HEAD
[3.2.1]:https://github.com/MetaMask/rpc-cap/compare/v3.2.1...v3.2.1
[3.2.0]:https://github.com/MetaMask/rpc-cap/compare/v3.1.0...v3.2.0
[3.1.0]:https://github.com/MetaMask/rpc-cap/compare/v3.0.1...v3.1.0
[3.0.1]:https://github.com/MetaMask/rpc-cap/compare/v3.0.0...v3.0.1
