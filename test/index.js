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

    permissions: {
      'eth_write': {
        method: 'eth_write',
        prereq: () => Promise.resolve(true),
      }
    },

    methods: {
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

})

test('#_callMethod with approved prereqs with no method throw error', async (t) => {
  const WRITE_RESULT = 'impeccable result'

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
      },
    },
  })

  let result = await ctrl._callMethod({method: 'eth_write'}, {}, () => {
    t.ok(true, 'next called')
    t.end()
  })
})

test('#providerMiddlewareFunction, approved prereqs with no method pass through', async (t) => {
  const WRITE_RESULT = 'impeccable result'

  const ctrl = new LoginController({
    origin: 'login.metamask.io',

    safeMethods: ['eth_read'],

    permissions: {
      'eth_write2': {
        method: 'eth_write2',
        prereq: () => Promise.resolve(true),
    }},

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
