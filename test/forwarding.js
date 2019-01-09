const test = require('tape')
const LoginController = require('../')

// TODO: Standardize!
// Maybe submit to https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
const USER_REJECTION_CODE = 5

test('safe method should pass through', async (t) => {
  const WRITE_RESULT = 'impeccable result'

  const ctrl = new LoginController({
    safeMethods: ['public_read'],
  })

  const domain = 'login.metamask.io'
  let req = { method: 'public_read' }
  let res = {}

  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(true, 'next was called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error thrown')
    t.equal(res.result, WRITE_RESULT)
    t.end()
  }

})

test('requesting restricted method is rejected', async (t) => {
  const WRITE_RESULT = 'impeccable result'
  const domain = 'login.metamask.io'

  const ctrl = new LoginController({

    // safe methods never require approval,
    // are considered trivial / no risk.
    // maybe reading should be a permission, though!
    safeMethods: ['eth_read'],

    // optional prefix for internal methods
    methodPrefix: 'wallet_',

    initState: {
      domains: {}
    },

    restrictedMethods: {
      'eth_write': {
        method: (req, res, next, end) => {
          res.result = WRITE_RESULT
        }
      }
    }
  })

  let req = { method: 'eth_write' }
  let res = {}
  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.ok(reason, 'error should be thrown')
    t.ok(res.error, 'should have error object')
    t.equal(reason.code, 1, 'error code should be 1.')
    t.equal(res.error.code, 1, 'error code should be 1.')
    t.notEqual(res.result, WRITE_RESULT, 'should not have complete result.')
    t.end()
  }

})

test('requesting restricted method with permission is called', async (t) => {
  const WRITE_RESULT = 'impeccable result'
  const domain = 'login.metamask.io'

  const ctrl = new LoginController({

    // safe methods never require approval,
    // are considered trivial / no risk.
    // maybe reading should be a permission, though!
    safeMethods: ['eth_read'],

    // optional prefix for internal methods
    methodPrefix: 'wallet_',

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
    },

    restrictedMethods: {
      'eth_write': {
        method: (req, res, next, end) => {
          res.result = WRITE_RESULT
          return end()
        }
      }
    }
  })

  let req = { method: 'eth_write' }
  let res = {}
  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'shuld not throw error')
    t.error(res.error, 'should not have error object')
    t.equal(res.result, WRITE_RESULT, 'Write result should be assigned.')
    t.end()
  }
})

test('#requestPermissions with rejected prompt throws error', async (t) => {
  const WRITE_RESULT = 'impeccable result'

  const ctrl = new LoginController({

    // safe methods never require approval,
    // are considered trivial / no risk.
    // maybe reading should be a permission, though!
    safeMethods: ['eth_read'],

    // Rejected prompt:
    requestUserApproval: async (domainInfo, req) => {
      return false
    },

    initState: {
      domains: {
        'metamask': {
          permissions: {
            'eth_write': {
              method: 'eth_write',
            },
          },
        },
      },
    },
  })

  let domain = 'metamask'
  let req = {
    method: 'requestPermissions',
    params: [{
      permissions: {
        'eth_write': {},
      }
    }],
  }
  let res = {}
  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.ok(reason, 'error should be thrown')
    t.ok(res.error, 'should have error object')
    t.equal(res.error.code, 1, 'error code should be 1.')
    t.end()
  }
})

test('#providerMiddlewareFunction getPermissions method returns serialized permissions', async (t) => {
  const WRITE_RESULT = 'impeccable result'
  const domain = 'metamask'

  const domains = {
    'metamask': {
      permissions: {
        'eth_write2': {
          method: 'eth_write2',
        },
      },
    },
  }

  const serializedPerms = JSON.stringify(domains)

  const ctrl = new LoginController({
    initState: { domains },

    restrictedMethods: {
      'eth_write': {
        method: (req, res, next, end) => {
          res.result = WRITE_RESULT
        }
      }
    }
  })

  let req = { method: 'getPermissions' }
  let res = {}
  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.fail('should not pass through')
    t.end()
  }

  function end(reason) {
    t.error(reason)
    t.equal(res.result, serializedPerms, 'returns serialized domains')
    t.end()
  }

})

