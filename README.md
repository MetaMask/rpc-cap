# JSON RPC Capabilities Middleware

A module for managing basic [capability-based security](https://en.wikipedia.org/wiki/Capability-based_security) over a [JSON-RPC API](https://www.jsonrpc.org/) as a middleware function for [json-rpc-engine](https://www.npmjs.com/package/json-rpc-engine).

For an intro to capability based security and why it makes sense, [I recommend this video](https://www.youtube.com/watch?v=2H-Azm8tM24).

Currently is an MVP capabilities system, with a certain usage assumption:

The consuming context is able to provide a `domain` to the middleware that is pre-authenticated. The library does not handle authentication, and trusts the `domain` parameter to the `providerMiddlewareFunction` is accurate and has been verified. (This was made initially as an MVP for proposing a simple capabilities system around [the MetaMask provider API](https://metamask.github.io/metamask-docs/API_Reference/Ethereum_Provider)).

This means the capabilities are not valuable without a connection to the granting server, which is definitely fairly acceptable for many contexts (just not like, issuing capabilities intended for redemption in a cryptographically verified smart contract).

![architecture diagram](./flow-chart.png)

## Installation

`npm install json-rpc-capabilities-middleware -S`

## Usage

The capability system is initialized with a variety of options, and is itself a [gaba](https://github.com/MetaMask/gaba/) compatible controller.

Once initialized, it exposes a special method `providerMiddlewareFunction(domain, req, res, next, end)`, which requires an authenticated `domain` object, followed by normal `json-rpc-engine` middleware parameters.

It will simply pass-through methods that are listed in the `safeMethods` array, but otherwise will require the requesting domain to have a permissions object, either granted by user, by approval on request, or by delegation from another domain that has the desired permission.

This module uses typescript, and so referring to the `.d.ts` files for interface definitions could be helpful. The tests are also very demonstrative.

```javascript
const Engine = require('json-rpc-engine')
const createCapabilities = require('json-rpc-capabilities-middleware')

const capabilities = createCapabilities({

  // Supports passthrough methods:
  safeMethods: ['get_index']

  // optional prefix for internal methods
  methodPrefix: 'wallet_',

  restrictedMethods: {

    // Restricted methods themselves are defined as
    // json-rpc-engine middleware functions.
  'send_money': {
    description: 'Allows sending your money away freely.',
      method: (req, res, next, end) => {
        sendMoney()
        res.result = 'Success!'
        end()
      }
    },
  },

  /**
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
        permissions: [
          {
            parentCapability: 'eth_write',
            date: '0',
          }
        ]
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

## Object Definitions

### Permissions Object

```
{
  method: 'restrictedMethodName',
  id: '63b225d0-414e-4a2d-8067-c34499c984c7', // UUID string
  date: 0, // unix time of creation
  granter: 'another.domain.com', // Another domain string if this permission was created by delegation.
  caveats: [ // An optional array of objects describing limitations on the method reference.
    {
      type: 'static', // The static caveat only returns the specified static response value.
      value: 'Always this!'
    }
  ]
}
```

## Current Status

This module is in an exploratory MVP state. It probably deserves more testing, scrutiny, consideration, maybe a TypeScript conversion, and a healthy beta period before I'd want to really trust it to a lot of value.

I've got it working with [a branch of metamask](https://github.com/MetaMask/metamask-extension/tree/capabilities-middleware-example) which you can use with [the sample site](https://metamask.github.io/json-rpc-capabilities-middleware/).

