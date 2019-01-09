const test = require('tape')
const LoginController = require('../')
const equal = require('fast-deep-equal')

// TODO: Standardize!
// Maybe submit to https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
const USER_REJECTION_CODE = 5

test('getPermissions with none returns empty object', async (t) => {
  const expected = {}

  const ctrl = new LoginController({})

  const domain = 'login.metamask.io'
  let req = { method: 'getPermissions' }
  let res = {}

  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error thrown')
    t.ok(equal(res.result, expected), 'should be equal')
    t.end()
  }
})

test('getPermissions with some returns them', async (t) => {
  const expected = {
    'restricted': {},
    'restricted2': { foo: 'bar' }
  }

  const ctrl = new LoginController({
    initState: {
      domains: {
        'login.metamask.io': {
          permissions: expected,
        },
      }
    }
  })

  const domain = 'login.metamask.io'
  let req = { method: 'getPermissions' }
  let res = {}

  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error thrown')
    t.ok(equal(res.result, expected), 'should be equal')
    t.end()
  }
})



