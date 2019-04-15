const test = require('tape')
const createPermissionsMiddleware = require('../')
const equal = require('fast-deep-equal')

// TODO: Standardize!
// Maybe submit to https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
const USER_REJECTION_CODE = 5

const arbitraryCaps = [
    {
      domain: 'bar',
      method: 'restricted',
      granter: 'baz',
      id: 'abc',
    },
    {
      domain: 'baz',
      method: 'restricted2',
      granter: 'bar',
      id: 'xyz',
    },
  ]

test('getPermissions with none returns empty object', async (t) => {
  const expected = []

  const ctrl = createPermissionsMiddleware({})

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
  const expected = arbitraryCaps

  const ctrl = createPermissionsMiddleware({
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



