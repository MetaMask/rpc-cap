# JSON RPC Capabilities Middleware

A module for managing [capability-based security](https://en.wikipedia.org/wiki/Capability-based_security) over a [JSON-RPC API](https://www.jsonrpc.org/) as a middleware function for [json-rpc-engine](https://www.npmjs.com/package/json-rpc-engine).

For an intro to capability based security and why it makes sense, [I recommend this video](https://www.youtube.com/watch?v=2H-Azm8tM24).

Note: Maybe should move towards compatibility with the [ocap-ld](https://w3c-ccg.github.io/ocap-ld/) standard.

Currently is an MVP capabilities system, with some certain usage assumptions:

- The consuming context is able to provide a `domain` to the middleware that is pre-authenticated. The library does not handle authentication, and trusts the `domain` parameter to the `providerMiddlewareFunction` is accurate and has been verified. (This was made initially as an MVP for proposing a simple capabilities system around [the MetaMask provider API](https://metamask.github.io/metamask-docs/API_Reference/Ethereum_Provider)).

This means the capabilities are not valuable without a connection to the granting server, which is definitely fairly acceptable for many contexts (just not like, issuing capabilities intended for redemption in a cryptographically verified smart contract).

![architecture diagram](./flow-diagram.png)

## Installation

`npm install json-rpc-capabilities-middleware -S`

## Usage

The capability system is initialized with a variety of options.

It will simply pass-through methods that are listed in the `safeMethods` array, but otherwise will require the requesting domain to have a permissions object, either granted by user, by approval on request, or by delegation from another domain that has the desired permission.

```javascript
const Engine = require('json-rpc-engine')
const Capabilities = require('json-rpc-capabilities-middleware')

const capabilities = new Capabilities({

  // Supports passthrough methods:
  safeMethods: ['get_index']

  // optional prefix for internal methods
  methodPrefix: 'wallet_',

  restrictedMethods: {

    // Restricted methods themselves are defined as
    // json-rpc-engine middleware functions.
    'send_money': (req, res, next, end) => {

    }
  },

  /*
  * A promise-returning callback used to determine whether to approve
  * permissions requests or not.
  *
  * Currently only returns a boolean, but eventually should return any specific parameters or amendments to the permissions.
  *
  * @param {string} domain - The requesting domain string
  * @param {string} req - The request object sent in to the `requestPermissions` method.
  * @returns {Promise<bool>} approved - Whether the user approves the request or not.
  */
  requestUserApproval: async (domainInfo, req) => {
    const ok = await checkIfUserTrusts(domainInfo, req)
    return ok
  },

  // Same state that is emitted from `this.store.subscribe((state) => {})`,
  // Following the `obs-store` module framework.
  // can be used to re-instantiate:
  initState: {
    domains: {
      'login.metamask.io': {
        permissions: {
          'eth_write': {
            date: '0',
          }
        }
      }
    }
  }

})

// Unlike normal json-rpc-engine middleware, these methods all require
// a unique requesting-domain-string as the first argument.
const domain = 'requestor.thatsite.com'
engine.push(capabilities.providerMiddlewareFunction.bind(capabilities, domain))

engine.push(finalMiddleware)
engine.start()
```

## Internal RPC Methods

The capabilities system adds new methods to the RPC, and you can modify what they are with a prefix of your chocie with the constructor param `methodPrefix`:

- getPermissions() - Returns the available (otherwise restricted) capabilities for the domain.
- requestPermissions(options) - Triggers the authroization flow, probably prompting user response, and creating the requested permissions objects if approved.
- grantPermissions(targetDomain, permissions) - Delegates some of the requesting domain's permissions to the `targetDomain`, if those permissions exist.
- revokePermissions(targetDomain, permissions) - Revokes a set of permissions if they are self-owned or were delegated by the requesting domain.

## Object Definitions

### Permissions Object

```
'restrictedMethodName': {
  date: 0, // unix time of creation
  grantedBy: 'another.domain.com', // another domain string if this permission was created by delegation.
}
```

## Current Status

This module is in an exploratory MVP state. It probably deserves more testing, scrutiny, consideration, maybe a TypeScript conversion, and a healthy beta period before I'd want to really trust it to a lot of value.

