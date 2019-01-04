# Eth Login Controller

A module for managing permissions extended to an untrusted domain, and enforcing those permissions over a JSON-RPC API as a middleware function for [json-rpc-engine](https://www.npmjs.com/package/json-rpc-engine).

## Installation

`npm install eth-login-controller -S`

## Usage

```javascript
const LoginController = require('eth-login-controller')

// Initialize one per domain you connect to:
const ctrl = new LoginController({
  origin: 'login.metamask.io',

  // safe methods never require approval,
  // are considered trivial / no risk.
  // maybe reading should be a permission, though!
  safeMethods: ['eth_read'],

  permissions: {
    'eth_write': {
      method: 'eth_write',
      prereq: () => Promise.resolve(true),
    }
  },

  // These are used if available, otherwise permitted methods
  // are passed through using the json-rpc-engine `next` method,
  // passing on to subsequent middleware.
  methods: {
    'eth_write': () => Promise.resolve(WRITE_RESULT)
  }
})

let req = { method: 'eth_write' }
let res= { foo: 'bar' }
ctrl.providerMiddlewareFunction(req, res, next, end)

function next() {
  t.ok(true, 'next was called')
  t.end()
}

function end(reason) {
  t.error(reason, 'error thrown')
  t.end()
}
```

