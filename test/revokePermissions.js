const test = require('tape')
const createPermissionsMiddleware = require('../')
const equal = require('fast-deep-equal')

// TODO: Standardize!  Maybe submit to https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
const USER_REJECTION_CODE = 5

test('revokePermissions on granted permission deletes that permission', async (t) => {

  const expected = {}

  const ctrl = createPermissionsMiddleware({
    initState: {
      "domains": {
        "login.metamask.io": {
          "permissions": {
            "restricted": {
              "date": "0"
            }
          }
        },
        "other.domain.com": {
          "permissions": {
            "restricted": {
              "date": 1547176021698,
              "grantedBy": "login.metamask.io"
            }
          }
        }
      }
    }
  })

  const domain = 'login.metamask.io'
  const otherDomain = 'other.domain.com'
  let req = {
    method: 'revokePermissions',
    params: [
      otherDomain,
      {
        'restricted': {},
      }
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error should not be thrown')
    t.ok(equal(ctrl.getPermissionsForDomain(otherDomain), expected), 'should have no permissions now')
    t.ok(ctrl.getPermissionsForDomain(domain), 'should have permissions still')
    t.end()
  }
})


test('revokePermissions on unrelated permission returns auth error', async (t) => {

  const expected = {}

  const ctrl = createPermissionsMiddleware({
    initState: {
      "domains": {
        "login.metamask.io": {
          "permissions": {
            "restricted": {
              "date": "0"
            }
          }
        },
        "other.domain.com": {
          "permissions": {
            "restricted": {
              "date": 1547176021698,
              "grantedBy": "unrelated.domain.co"
            }
          }
        }
      }
    }
  })

  const domain = 'login.metamask.io'
  const otherDomain = 'other.domain.com'
  let req = {
    method: 'revokePermissions',
    params: [
      otherDomain,
      {
        'restricted': {},
      }
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.ok(reason, 'error thrown')
    t.equal(reason.code, 1, 'Auth error returned')
    t.ok(ctrl.getPermissionsForDomain(otherDomain), 'should have permissions still')
    t.ok(ctrl.getPermissionsForDomain(otherDomain), 'should have permissions still')
    t.end()
  }

})

test('revokePermissions on own permission deletes that permission.', async (t) => {

  const ctrl = createPermissionsMiddleware({
    initState: {
      "domains": {
        "login.metamask.io": {
          "permissions": {
            "restricted": {
              "date": "0"
            }
          }
        },
        "other.domain.com": {
          "permissions": {
            "restricted": {
              "date": 1547176021698,
              "grantedBy": "unrelated.domain.co"
            }
          }
        }
      }
    }
  })

  const domain = 'login.metamask.io'
  let req = {
    method: 'revokePermissions',
    params: [
      domain,
      {
        'restricted': {},
      }
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error should not be thrown')
    t.ok(equal(ctrl.getPermissionsForDomain(domain), {}), 'should have deleted permissions')
    t.end()
  }

})

