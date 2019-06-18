# Caveat Traversal Algorithm

A given capability (`restrictedMethod`) can be granted by any number of paths, forming an acyclic directed graph terminating in the recipient/caller.

When multiple delegations (`grantPermission`) point at the same `origin` for the same `restrictedMethod`, they need to be reconciled into a single function call, and a single result, and this can involve many operations, because we have many variables at play:

- Transitive delegation.
- Multiple capability types.
- Caveats that can mutate both the outbound request and the inbound response.

This means forks in the delegation path become combined to increase permission, and chains are combined in a way that can only increasingly restrict the permission.

## Outbound Requests

At the point of issuing a request, all entries for that calling `origin` and the called `restrictedMethod` are loaded into a `permissions` array.

# Maybe We Instead Put This on Dapps

What if we didn't automate the permissions traversal mechanism? What if instead, in the case of multiple permissions granted to a recipient, they received a unique method ID per permission?

This has nice vibes around it because many capability models revolve around the notion of cryptographically strong (unguessable) identifiers.

It also is nice that it puts the power of optionality in the hands of the Dapps themselves. If two friends give you a redemption code, when using it, you need to specify which one. There is no universal solution to this, only arbitrary or opinionated ones.

It's also immediately practically beneficial because it lets us avoid the complicated question about merging chains of delegation.

## Changes to Avoid This Problem

- Add method `getCurrentPermissions(methodNames?:string[]) => PermissionObject[]` for getting a list of current permissions from the environment.
- Restricted methods are always called _per that permission_. Maybe something like `callRestrictedMethod(methodId, params)`.
- Update the delegation methods (`grantPermissions` and `revokePermissions`) to operate on specific `methodId` strings instead of method names.

## Question: What is a Permission Object?

```typescript
interface PermissionObject {
    name?: string; // Should this be required?
}
```

## The Crypto Benefits are Rearing their Heads

Why are we storing this table of permisisons, anyways? It's a memory leak for us to store it. If we just incorporated signing with app keys, and confined app key signing very well, then we could put the permissions directly in the app's hands.

## Let's not get ahead of ourselves

## Question: What is a Permission Object?

```typescript
interface PermissionObject {
    "@context": UrlString[]; // for ocap-ld compliance
    id: string;
    name?: string; // Should this be required?
    types?: TypeObject; // Ooh, wouldn't THAT be cool?
    description?: string; // I mean, if we're going to do this, do it right?
    caveats: SerializedCaveat[]; // Yeah this probably extends the RpcCapPermission object.
    granter?: DomainString; // Starting to look like our serialized permission...
    parentCapability?: PermissionObject; // What if we did this as a way of providing the capability chain?
}
```

Should we include the delegation chain? If they have a granter, shouldn't you see what was granted? Those granter's caveats are going to be applied to your capabilities anyways, so you probably should know what the sum of your capabilities are.

If so, we should provide convenience method for summarizing a single `caveats` array from a `PermissionObject` (which itself may contain nested and cumulative caveats).

## To Do:

- Add method `getCurrentPermissions(methodNames?:string[]) => PermissionObject[]` for getting a list of current permissions from the environment.
- Restricted methods are always called _per that permission_. Maybe something like `callRestrictedMethod(methodId, params)`.
- Update the delegation methods (`grantPermissions` and `revokePermissions`) to operate on specific `methodId` strings instead of method names.
- Provide convenience method for summarizing a single `caveats` array from a `PermissionObject` (which itself may contain nested and cumulative caveats).

## First, some inspiration

[Ocap-ld.js from DigitalBazaar](https://github.com/digitalbazaar/ocapld.js/blob/master/lib/CapabilityDelegation.js)

```typescript
interface CapabilityDelegation {
    capabilityChain: Capability[]; // First entry is root, last is parent of this delegation.
    capability?: Capability;
    // Params that don't apply to us so much:
    verifiedParentCapability?: Capability;
    expectedTarget?: UriString; // For invoking over http

}
```

Man, that library is so verbose. It's so unappealing to have to interface with. Can we make an interface for developers to use capabilities without having to do those flips? Can it be as easy as passing around function references?

With capnode, I really think we could do that. Rather than passing back these capability-describing objects, we could pass back capnode functions with a special `capabilityMetadata` property that includes all this stuff for advanced use.

Most dapps will just care that they have a function they can call. Advanced dapps can get analyze the nuance of what they've been granted.

# After a weekend of consideration

The simplest path to MVP seems to forego delegation and its trials entirely: If we first focus on permitting restricted methods, those applications can then be responsible for delegating their own permissions. In the case of plugins, this already makes many things possible, since scripts can request permission to interact with each other.


