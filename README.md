# JSON RPC Engine Capabilities

A module for managing [capability-based security](https://en.wikipedia.org/wiki/Capability-based_security) over a [JSON-RPC API](https://www.jsonrpc.org/) as a middleware function for [json-rpc-engine](https://www.npmjs.com/package/json-rpc-engine).

For an intro to capability based security and why it makes sense, [I recommend this video](https://www.youtube.com/watch?v=2H-Azm8tM24).

![architecture diagram](./flow-diagram.png)

## Installation

`npm install json-rpc-engine-capabilities -S`

## Usage

```javascript
const Engine = require('json-rpc-engine')
const RpcCapabilities = require('json-rpc-engine-capabilities')

const capabilities = new RpcCapabilities({

  // Supports passthrough methods:
  safeMethods: ['get_index']
  safeCheckingFunction,

  // optional prefix for internal methods
  methodPrefix: 'wallet_',

  restrictedMethods: {
    'send_money': {
      validationFunction,

      // Description can be make confirmation UI easier to develop:
      description: 'Ability to send funds freely.'
      optionalTypeData,
      method: this.sendMoney.bind(this),
    }
  },

  requestUserApproval: async (domainInfo, req) => {
    const ok = await checkIfUserTrusts(domainInfo, req)
    return ok
  },

  // Same state that is emitted from `this.store`,
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

The capabilities system also adds two new methods to the RPC, and you can modify what they are with a prefix of your chocie:

- `getCapabilities()` returns a list of capability descriptors.
- `requestCapabilities(capabilities)` prompts user approval of some capability.
- `useCapability(capability, params)` Performs the desired function.

### Important distinction

Some capabilities will prompt user approval. This is different than lacking the capability to perform that action. There are two different capabilities: The ability to perform an action without further confirmation, and the ability to suggest a possible action.

## Object Definitions

A capability descriptor as passed to the requestor in response to `getCapabilities()`:

```
{
  method: 'send_money',
  capability_id: 'STRONG_RANDOM_ID_LINK',
  description, // string
  optionalTypeData, // allows easy consumption of these dynamic methods.
}
```

## Current Status

This module is in progress, and is not ready for production. Currently thigns that need doing:

- Get tests passing.
- Ensure the internal methods are working.

