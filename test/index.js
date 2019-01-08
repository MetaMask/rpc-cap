const test = require('tape')
const LoginController = require('../')

test('setup test', async (t) => {
  const WRITE_RESULT = 'impeccable result'

  const ctrl = new LoginController({
    origin: 'login.metamask.io',

    // safe methods never require approval,
    // are considered trivial / no risk.
    // maybe reading should be a permission, though!
    safeMethods: ['eth_read'],

    // optional prefix for internal methods
    methodPrefix: 'wallet_',

    initState: {
      domains: {
        'metamask': {
          permissions: {
            'eth_write': {
              method: 'eth_write',
              prereq: () => Promise.resolve(true),
            }
          }
        }
      }
    },

    restrictedMethods: {
      'eth_write': () => Promise.resolve(WRITE_RESULT)
    }
  })

  try {
    let result = await ctrl._callMethod({method: 'eth_write'}, {})
    t.equal(result, WRITE_RESULT, 'write result returned')
  } catch (error) {
    t.error(error, 'want no error')
    t.end(error)
  }

  let req = { method: 'eth_write' }
  let res = {}
  ctrl.providerMiddlewareFunction(req, res, next, end)

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

test('#_callMethod with approved prereqs with no method throw error', async (t) => {
  const WRITE_RESULT = 'impeccable result'

  const ctrl = new LoginController({
    origin: 'login.metamask.io',

    // safe methods never require approval,
    // are considered trivial / no risk.
    // maybe reading should be a permission, though!
    safeMethods: ['eth_read'],

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

  let result = await ctrl._callMethod({method: 'eth_write'}, {}, () => {
    t.ok(true, 'next called')
    t.end()
  })
})

test('#requestMethod with rejected prompt throws error', async (t) => {
  const WRITE_RESULT = 'impeccable result'

  const ctrl = new LoginController({
    origin: 'login.metamask.io',

    // safe methods never require approval,
    // are considered trivial / no risk.
    // maybe reading should be a permission, though!
    safeMethods: ['eth_read'],

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

  try {
    let result = await ctrl.requestMethod({method: 'eth_write'}, {}, () => {
      t.false(true, 'next called')
      t.end()
    })
  } catch (error) {
    t.ok(error)
    t.end()
  }
})

test('#providerMiddlewareFunction, approved prompt with no method pass through', async (t) => {
  const WRITE_RESULT = 'impeccable result'

  const ctrl = new LoginController({
    origin: 'login.metamask.io',

    safeMethods: ['eth_read'],

    domains: {
      'metamask': {
        permissions: {
          'eth_write2': {
            method: 'eth_write2',
          },
        },
      },
    },

  })

  let req = { method: 'eth_write' }
  let res= { foo: 'bar' }
  ctrl.providerMiddlewareFunction(req, res, next, end)

  function next() {
    t.ok(true, 'passed through')
    t.end()
  }

  function end(reason) {
    t.error(reason)
    t.end()
  }

})

test('#providerMiddlewareFunction getPermissions method returns serialized permissions', async (t) => {
  const WRITE_RESULT = 'impeccable result'

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
    origin: 'login.metamask.io',

    safeMethods: ['eth_read'],

    initState: { domains },
  })

  let req = { method: 'wallet_getPermissions' }
  let res = { foo: 'bar' }
  ctrl.providerMiddlewareFunction(req, res, next, end)

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

test('#providerMiddlewareFunction requestPermissions method adds to requested permissions', {
  timeout: 500,
}, async (t) => {
  const WRITE_RESULT = 'impeccable result'

  const permissions = {}
  const ctrl = new LoginController({
    origin: 'login.metamask.io',

    safeMethods: ['eth_read'],

    initState: { permissions },
  })

  ctrl.memStore.subscribe((memStore) => {
    const { permissionsRequests } = memStore
    if ('eth_write2' in permissionsRequests[0]) {
      t.ok(permissionsRequests, 'permission added to requests')
      t.end()
    }
  })

  let req = {
    method: 'wallet_requestPermissions',
    params: [{ 'eth_write2': { method: 'eth_write2' } }]
  }

  let res = { foo: 'bar' }
  ctrl.providerMiddlewareFunction(req, res, next, end)

  function next() {
    t.fail('should not pass through')
    t.end()
  }

  function end(reason) {
    t.error(reason)
  }
})

